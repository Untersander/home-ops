# Infra Services

The following infra services are installed via Flux:
- flux
- cilium
- kubelet-csr-approver
- cert-manager
- external-secret-operator
- kubevirt


## Flux
First initialization repository with Flux:
```bash
flux bootstrap git \
  --url=ssh://git@github.com/Untersander/home-ops.git \
  --branch=main \
  --path=infra \
  --ssh-key-algorithm=ed25519
```

If git repository already contains the flux bootstrap resources, run:
```bash
flux install
flux create secret git flux-system \
  --url=ssh://git@github.com/Untersander/home-ops.git \
  --ssh-key-algorithm=ed25519
flux create source git flux-system \
  --url=ssh://git@github.com/Untersander/home-ops.git \
  --branch=main \
  --interval=1m \
  --secret-ref=flux-system
flux create kustomization flux-system \
  --source=GitRepository/flux-system \
  --path=./infra \
  --prune=true \
  --interval=10m
```

To rotate the deploy key, delete the flux-system secret and flux create a new one:
```bash
kubectl -n flux-system delete secret flux-system
flux create secret git flux-system \
  --url=ssh://git@github.com/Untersander/home-ops.git \
  --ssh-key-algorithm=ed25519
```

Upgrade Flux:
```bash
flux install --export > ./infra/flux-system/gotk-components.yaml
```

## Secret Management
Secrets are managed using [External Secrets](https://external-secrets.io/), which fetches secrets from 1Password.
All Kubernetes secrets are stored in the 1Password vault named `Kubernetes`, including the Service Account token called `Service Account Auth Token Kubernetes`, which is used to connect External Secrets Operator (ESO) with 1Password.
To connect, create a secret using the Service Account token with this template:
```bash
kubectl create secret generic onepasswordsecret -n external-secrets \
    --from-literal=token=$(op read "op://Kubernetes/Service Account Auth Token Kubernetes/credential")
```
If you don't have the 1Password CLI installed, you can also use the following command to create the secret:
```bash
kubectl create secret generic onepasswordsecret --from-literal=token=<yourTokenGoesHere_inPlaintext> --namespace=external-secrets
```

## Storage
Possible storage solutions:
- OpenEBS
- Rook-Ceph
- Longhorn
Currently OpenEBS with ZFS is in use.
Additionally the snapshot controller from external-snapshotter could be used for volume snapshots.
### OpenEBS
[OpenEBS](https://openebs.io/docs/Solutioning/openebs-on-kubernetes-platforms/talos)

For LocalPV ZFS enable the zfs kernel module and add siderolabs/zfs system extension.
[More Infos for zfs system extension](https://github.com/siderolabs/extensions/blob/main/storage/zfs/README.md)
After upgrading Talos to correct image and config, in case of new zpools, run:
```bash
# create the debug pod again
kubectl -n kube-system debug -it --profile sysadmin --image=alpine node/<node name>
# you are now in the pod again
# the following command will create the software raid

# This example creates a zfs raidz2
# IMPORTANT: you can only use the /var/<some name> mount [read](https://www.talos.dev/v1.8/learn-more/architecture/#the-file-system)
chroot /host zpool create -f \
-o ashift=12 \
-O mountpoint="/var/mnt/zpool" \
-O xattr=sa \
-O compression=on \
-O acltype=posix \
-O atime=off \
hdd \
raidz \
/dev/disk/by-id/wwn-0x5000c500c8b522a2 \
/dev/disk/by-id/wwn-0x5000c500c8b54eb0 \
/dev/disk/by-id/wwn-0x5000c500c8a5d88f
```

OpenEBS is installed via Flux.

### Rook-Ceph
Rook-Ceph Operator install:
```bash
helm repo add rook-release https://charts.rook.io/release
helm repo update
helm upgrade -i --create-namespace --namespace rook-ceph rook-ceph rook-release/rook-ceph --version v1.18.8 -f ../infra/rook-ceph/app/values.yaml
kubectl label namespace rook-ceph pod-security.kubernetes.io/enforce=privileged
kubectl label namespace rook-ceph pod-security.kubernetes.io/warn=privileged
```

Configure and setup Ceph Cluster:
```bash
helm upgrade -i --namespace rook-ceph rook-ceph-cluster rook-release/rook-ceph-cluster --version v1.18.8 -f ../infra/rook-ceph/config/values.yaml
```

Cleanup complete Ceph cluster (WARNING: DATA LOSS):
```bash
kubectl -n rook-ceph patch cephcluster rook-ceph --type merge -p '{"spec":{"cleanupPolicy":{"confirmation":"yes-really-destroy-data"}}}'
kubectl -n rook-ceph delete cephcluster rook-ceph
kubectl -n rook-ceph delete cephblockpools.ceph.rook.io --all
kubectl -n rook-ceph delete cephfilesystems.ceph.rook.io --all
kubectl -n rook-ceph delete cephfilesystemsubvolumegroups --all
kubectl -n rook-ceph delete cephobjectstores.ceph.rook.io --all
# Wait for cluster-cleanup job to finish
kubectl -n rook-ceph wait --for=condition=complete job/cluster-cleanup-job-cp-0 --timeout=600s
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: disk-clean
  namespace: rook-ceph
spec:
  restartPolicy: Never
  nodeName: cp-0
  volumes:
  - name: rook-data-dir
    hostPath:
      path: /var/mnt/local-system-sdd/lib/rook
  containers:
  - name: disk-clean
    image: busybox
    securityContext:
      privileged: true
    volumeMounts:
    - name: rook-data-dir
      mountPath: /node/rook-data
    command: ["/bin/sh", "-c", "rm -rf /node/rook-data/*"]
EOF
```

### Longhorn
[Longhorn install](https://longhorn.io/docs/1.9.0/advanced-resources/os-distro-specific/talos-linux-support/)

### Snapshot
Snapshot CRDs and controller install:
```bash
kubectl kustomize https://github.com/kubernetes-csi/external-snapshotter/client/config/crd | kubectl delete -f -
kubectl -n kube-system kustomize https://github.com/kubernetes-csi/external-snapshotter/deploy/kubernetes/snapshot-controller | kubectl delete -f -
```

## TODO
- Make wireguard configuration declarative via flux and external-secrets