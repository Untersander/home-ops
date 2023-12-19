# Talos Homelab Configuration
This repository contains the configuration for my homelab. It is managed by [Talos](https://www.talos.dev/), a Kubernetes distribution.

See [Documentation](https://www.talos.dev/v1.5/) for more information.

## Bootstrap
```bash
talosctl bootstrap -n 10.0.0.4
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
export KUBERNETES_API_SERVER_ADDRESS=10.0.0.4
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

## Nvidia GPU Support

Nvidia GTX 760 is not supported by provided drivers. I need to use legacy 470.XX drivers.

```bash
helm repo add nvdp https://nvidia.github.io/k8s-device-plugin
helm repo update
helm install nvidia-device-plugin nvdp/nvidia-device-plugin --version=0.14.3 --set=runtimeClassName=nvidia --namespace=nvidia --create-namespace
```
