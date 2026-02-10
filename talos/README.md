# Talos Home Lab Config

This is a basic Talos home lab config for a single node k8s cluster, which will be used as a 25 Gbit/s router/firewall and home server.

Download to ISO from the [Talos Image Factory](https://factory.talos.dev/) and write to USB stick:
```bash
dd if=path/to/talos.iso of=/dev/sdX bs=4M status=progress conv=fsync
```

Metal ISO Factory URLs:
- [AMD-Metal-ISO-ZFS-Secure-Boot-v1.12.1](https://factory.talos.dev/?arch=amd64&cmdline=talos.config%3Dmetal-iso&cmdline-set=true&extensions=siderolabs%2Fzfs&platform=metal&secureboot=true&target=metal&version=1.12.1)

To update just change the version in the URL.

Following custimization is added to the Talos image via the factory URL:
```yaml
customization:
    extraKernelArgs:
        - talos.config=metal-iso
    systemExtensions:
        officialExtensions:
            - siderolabs/zfs
```
## Generate Machine Configs
Generate secrets bundle:
```bash
talosctl gen secrets -o secrets.yaml
```
These secrets are stored in 1Password.

Set environment variables for the Talos CLI and create the machine configurations using the secrets and machine patches.
AMD node:
```bash
export CLUSTER_NAME=k8s-garden
export K8s_API_ENDPOINT=https://api.k8s.garden:6443
export INSTALLER_IMAGE=factory.talos.dev/metal-installer-secureboot/53eda813751085f0a61b224c00256666bba00dcf409d5eb50b140ddb64c76c1a:v1.12.1
export NODE_NAME=cp-0
talosctl gen config $CLUSTER_NAME $K8s_API_ENDPOINT \
  --with-secrets secrets.yaml \
  --config-patch @machine-patches/base-patch.yaml \
  --config-patch @machine-patches/disk-patch.yaml \
  --config-patch @machine-patches/openebs-patch.yaml \
  --config-patch @machine-patches/$NODE_NAME-patch.yaml \
  --output-types controlplane \
  --install-image $INSTALLER_IMAGE \
  --install-disk "" \
  --force \
  -o machine-configs/cp-0.yaml
```

## Initial config on first boot provided via ISO
Generate a `metal-iso` ISO with the new config and burn to additional USB stick:
```bash
NODE_NAME=cp-0
cp machine-configs/$NODE_NAME.yaml metal-config/config.yaml

mkisofs -joliet -rock -volid 'metal-iso' -output metal-config.iso metal-config/config.yaml
# Or if you don't have mkisofs
docker run --rm -v $(pwd)/:/data alpine:latest \
 sh -c "apk add cdrkit && mkisofs -joliet -rock -volid 'metal-iso' -output /data/metal-config.iso /data/metal-config/config.yaml"
```

Write new ISO to USB stick.

See [Metal ISO](https://www.talos.dev/v1.11/reference/kernel/#metal-iso) for more details.

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
  --force \
  -o talosconfig.yaml
```
Set the Talos endpoint, as the `--endpoints` flag does not work at the moment.
You can also set the node so you don't have to provide `-n <IP_ADDRESS>` all the time.
```bash
talosctl config merge talosconfig.yaml
export IP_ADDRESS=10.0.0.1
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
helm fetch cilium/cilium --version 1.19.0 --destination ../tmp
helm upgrade --install cilium ../tmp/cilium-1.19.0.tgz \
 --namespace kube-system \
 --values ../infra/cilium/app/values.yaml \
 --set operator.prometheus.serviceMonitor.enabled=false \
 --set prometheus.serviceMonitor.enabled=false \
 --set hubble.metrics.serviceMonitor.enabled=false \
 --set hubble.relay.prometheus.serviceMonitor.enabled=false
```

## Base CSR Approver setup
```bash
helm repo add kubelet-csr-approver https://postfinance.github.io/kubelet-csr-approver
helm repo update
helm fetch kubelet-csr-approver/kubelet-csr-approver --version 1.2.11 --destination ../tmp
helm upgrade --install kubelet-csr-approver ../tmp/kubelet-csr-approver-1.2.11.tgz \
 --version 1.2.11 \
 --namespace kube-system \
 --values ../infra/kubelet-csr-approver/app/values.yaml
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

## Home "Router" Setup
Connect local network ports to br0 interface on the Talos node.
Provide a DHCP/DNS server via Pi-hole container through Multus with bridge interface or without Multus and host network. (host DNS caching probably needs to be disabled in Talos config, if using host network, check open listening ports on Talos with `ss -tuln`)
```yaml
machine:
  features:
    hostDNS:
      enabled: true
```