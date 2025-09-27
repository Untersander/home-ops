# Talos Home Lab Config

This is a basic Talos home lab config for a single node k8s cluster, which will be used as a 25 Gbit/s router/firewall and home server.

Download to ISO from the [Talos Image Factory](https://factory.talos.dev/) and write to USB stick:
```bash
dd if=path/to/talos.iso of=/dev/sdX bs=4M status=progress conv=fsync
```

Metal ISO Factory URLs:
- [AMD-Metal-ISO-Secure-Boot-v1.11.2](https://factory.talos.dev/?arch=amd64&cmdline=talos.config%3Dmetal-iso&cmdline-set=true&extensions=-&platform=metal&secureboot=true&target=metal&version=1.11.2)
```bash
export AMD_INSTALLER_IMAGE=factory.talos.dev/metal-installer-secureboot/d0b273850841b13d0193fbfb0597bac2ca30387b8a0797a43238ecafc72ed329:v1.11.2
```
- [ARM-Metal-ISO-v1.11.2](https://factory.talos.dev/?arch=arm64&cmdline=talos.config%3Dmetal-iso&cmdline-set=true&extensions=-&platform=metal&target=metal&version=1.11.2)
```bash
export ARM_INSTALLER_IMAGE=factory.talos.dev/metal-installer/d0b273850841b13d0193fbfb0597bac2ca30387b8a0797a43238ecafc72ed329:v1.11.2
```

To update just change the version in the URL.

## Initial config on first boot provided via ISO
Add `config.yaml` to `metal-iso/` folder and create new ISO:
```bash
mkisofs -joliet -rock -volid 'metal-iso' -output config.iso metal-iso/
```
Write new ISO to USB stick.

See [Metal ISO](https://www.talos.dev/v1.11/reference/kernel/#metal-iso) for more details.

Generate secrets bundle:
```bash
talosctl gen secrets -o secrets.yaml
```
These secrets are stored in 1Password.

Set environment variables for the Talos CLI:
```bash
export CLUSTER_NAME=k8s-garden
export K8s_API_ENDPOINT=https://api.k8s.garden:6443
```

Create the machine configurations using the secrets and machine patches.
AMD node:
```bash
export NODE_NAME=cp-0
talosctl gen config $CLUSTER_NAME $K8s_API_ENDPOINT \
  --with-secrets secrets.yaml \
  --config-patch @machine-patches/base-patch.yaml \
  --config-patch @machine-patches/$NODE_NAME-patch.yaml \
  --output-types controlplane \
  --install-image $AMD_INSTALLER_IMAGE \
  --install-disk "" \
  --force \
  -o machine-configs/cp-0.yaml
```

ARM node:
```bash
export NODE_NAME=vcp-0
talosctl gen config $CLUSTER_NAME $K8s_API_ENDPOINT \
  --with-secrets secrets.yaml \
  --config-patch @machine-patches/base-patch.yaml \
  --config-patch @machine-patches/$NODE_NAME-patch.yaml \
  --output-types controlplane \
  --install-image $ARM_INSTALLER_IMAGE \
  --install-disk "" \
  --force \
  -o machine-configs/vcp-0.yaml
```

Generate a `metal-iso` ISO with the new config and burn to additional USB stick:
```bash
NODE_NAME=cp-0
cp machine-configs/$NODE_NAME.yaml metal-config/config.yaml

mkisofs -joliet -rock -volid 'metal-iso' -output metal-config.iso metal-config/
# Or if you don't have mkisofs
docker run --rm -v $(pwd)/:/data alpine:latest sh -c "apk add cdrkit && mkisofs -joliet -rock -volid 'metal-iso' -output /data/metal-config.iso /data/metal-config/"
```

Or use talosctl to apply the config remotely:
```bash
talosctl apply-config --file machine-configs/$NODE_NAME.yaml --insecure -n <IP_ADDRESS>
```
After the first boot you can always re-apply the config using:
```bash
talosctl apply-config --file machine-configs/$NODE_NAME.yaml -n <IP_ADDRESS>
```
## Generate Talosconfig to access the cluster
```bash
talosctl gen config $CLUSTER_NAME $K8s_API_ENDPOINT \
  --with-secrets secrets.yaml \
  --output-types talosconfig \
  -o talosconfig.yaml
```
Set the Talos endpoint, as the `--endpoints` flag does not work at the moment.
You can also set the node so you don't have to provide `-n <IP_ADDRESS>` all the time.
```bash
$IP_ADDRESS=<IP_ADDRESS>
talosctl config endpoint $IP_ADDRESS
talosctl config node $IP_ADDRESS
```

## Bootstrap
Make sure to run the bootstrap command only against one node in the cluster.
```bash
talosctl bootstrap
```

## Generate kubeconfig to access the k8s cluster
```bash
talosctl kubeconfig ~/.kube/talos-k8s-garden.config
```

## Base cilium setup

```bash
helm repo add cilium https://helm.cilium.io
helm repo update
helm upgrade --install cilium cilium/cilium \
 --version 1.18.2 \
 --namespace kube-system \
 --values - <<'EOF'
ipam:
 mode: kubernetes
kubeProxyReplacement: true
securityContext:
 capabilities:
   ciliumAgent: [CHOWN, KILL, NET_ADMIN, NET_RAW, IPC_LOCK, SYS_ADMIN, SYS_RESOURCE, DAC_OVERRIDE, FOWNER, SETGID, SETUID]
   cleanCiliumState: [NET_ADMIN, SYS_ADMIN, SYS_RESOURCE]
cgroup:
 autoMount:
   enabled: false
 hostRoot: /sys/fs/cgroup
k8sServiceHost: localhost
k8sServicePort: 7445
EOF
```

## Single Node Cluster
Make control plane node schedulable:
```bash
kubectl taint nodes --all node-role.kubernetes.io/control-plane:NoSchedule-
```

## Cilium Config

It's important that following machineconfig and clusterconfigs are set:
```yaml
cluster:
  network:
    cni:
      name: none
  proxy:
    disabled: true

machine:
  features:
    kubePrism:
      enabled: true
      port: 7445
```