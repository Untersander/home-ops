# Talos Home Lab Config

This is a basic Talos home lab config for a single node k8s cluster, which will be used as a 25 Gbit/s router/firewall and home server.

Download to ISO from the [Talos Image Factory](https://factory.talos.dev/) and write to USB stick:
```bash
dd if=path/to/talos.iso of=/dev/sdX bs=4M status=progress conv=fsync
```

Current used ISO:
```bash
https://factory.talos.dev/?arch=amd64&cmdline=talos.config%3Dmetal-iso&cmdline-set=true&extensions=-&extensions=siderolabs%2Frealtek-firmware&extensions=siderolabs%2Fusb-modem-drivers&platform=metal&target=metal&version=1.11.1
https://factory.talos.dev/image/e210eaa3bf65a7b38690dbf6d6940430777f272004cfb67f2035389b1c906542/v1.11.1/metal-amd64.iso
factory.talos.dev/metal-installer/e210eaa3bf65a7b38690dbf6d6940430777f272004cfb67f2035389b1c906542:v1.11.1
```
[Metal-Secure Boot](https://factory.talos.dev/image/d8018605477611e194ebc3c2a2c681753d0629f35434acf713d5c4f26f2adaa0/v1.11.1/metal-amd64-secureboot.iso)
customization:
    systemExtensions:
        officialExtensions:
            - siderolabs/realtek-firmware
            - siderolabs/usb-modem-drivers

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
export K8s_API_ENDPOINT=https://10.0.0.4:6443
export IP_ADDRESS=10.0.0.4
```

Create the machine configurations using the secrets and machine patches:
```bash
talosctl gen config $CLUSTER_NAME $K8s_API_ENDPOINT \
  --with-secrets secrets.yaml \
  --config-patch @machine-patches/machine-patch.yaml \
  --output-types controlplane \
  --install-image factory.talos.dev/metal-installer-secureboot/d8018605477611e194ebc3c2a2c681753d0629f35434acf713d5c4f26f2adaa0:v1.11.1 \
  --install-disk "" \
  --force \
  -o metal-config/config.yaml
```

Generate a `metal-iso` ISO with the new config and burn to additional USB stick:
```bash
mkisofs -joliet -rock -volid 'metal-iso' -output metal-config.iso metal-config/
# Or if you don't have mkisofs
docker run --rm -v $(pwd)/:/data alpine:latest sh -c "apk add cdrkit && mkisofs -joliet -rock -volid 'metal-iso' -output /data/metal-config.iso /data/metal-config/"
```

Or use talosctl to apply the config remotely:
```bash
talosctl apply-config --insecure -n $IP_ADDRESS --file metal-config/config.yaml
```
## Generate Talosconfig to access the cluster
```bash
talosctl gen config $CLUSTER_NAME $K8s_API_ENDPOINT \
  --with-secrets secrets.yaml \
  --output-types talosconfig \
  --endpoints 10.0.0.4 \
  -o talosconfig.yaml
```
Set the Talos endpoint, as the `--endpoints` flag does not work at the moment.
You can also set the node so you don't have to provide `-n <IP_ADDRESS>` all the time.
```bash
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
Templated cilium config install method:
```bash
export KUBERNETES_API_SERVER_ADDRESS=$IP_ADDRESS
export KUBERNETES_API_SERVER_PORT=6443
export QPS=30
export BURST=60

helm install \
    cilium \
    cilium/cilium \
    --version 1.14.5 \
    --namespace kube-system \
    --set ipam.mode=kubernetes \
    --set=kubeProxyReplacement=true \
    --set l2announcements.enabled=true \
    --set k8sClientRateLimit.qps=$QPS \
    --set k8sClientRateLimit.burst=$BURST \
    --set=securityContext.capabilities.ciliumAgent="{CHOWN,KILL,NET_ADMIN,NET_RAW,IPC_LOCK,SYS_ADMIN,SYS_RESOURCE,DAC_OVERRIDE,FOWNER,SETGID,SETUID}" \
    --set=securityContext.capabilities.cleanCiliumState="{NET_ADMIN,SYS_ADMIN,SYS_RESOURCE}" \
    --set=cgroup.autoMount.enabled=false \
    --set=cgroup.hostRoot=/sys/fs/cgroup \
    --set=k8sServiceHost=localhost \
    --set=k8sServicePort=7445 \
    --set=operator.replicas=1
```