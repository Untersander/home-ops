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
export K8s_API_ENDPOINT=https://10.0.0.4:6443
```

Create the machine configurations using the secrets and machine patches:
```bash
talosctl gen config $CLUSTER_NAME $K8s_API_ENDPOINT \
  --with-secrets secrets.yaml \
  --config-patch @machine-patches/machine-patch.yaml \
  --output-types controlplane \
  --install-image factory.talos.dev/metal-installer/e210eaa3bf65a7b38690dbf6d6940430777f272004cfb67f2035389b1c906542:v1.11.1 \
  --install-disk "" \
  --force \
  -o metal-iso/config.yaml
```

Generate a `metal-iso` ISO with the new config and burn to additional USB stick:
```bash
mkisofs -joliet -rock -volid 'metal-iso' -output config.iso metal-iso/
# Or if you don't have mkisofs
docker run --rm -v $(pwd)/:/data alpine:latest sh -c "apk add cdrkit && mkisofs -joliet -rock -volid 'metal-iso' -output /data/config.iso /data/metal-iso/"
```

Or use talosctl to apply the config remotely:
```bash
talosctl apply-config --insecure -n $IP_ADDRESS --file config.yaml
```





## Bootstrap
```bash
talosctl bootstrap -n $IP_ADDRESS
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