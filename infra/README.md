# Infra Services

The following infra services are installed via Flux:
- flux
- cilium
- kubelet-csr-approver
- cert-manager
- external-secret-operator
- kubevirt


Temporary notes:

Flux:
```bash

flux bootstrap git \
  --url=ssh://git@github.com/Untersander/home-ops.git \
  --branch=main \
  --path=infra

```

Kubelet CSR Approver:
```bash
helm repo add kubelet-csr-approver https://postfinance.github.io/kubelet-csr-approver
helm upgrade -i kubelet-csr-approver kubelet-csr-approver/kubelet-csr-approver -n kube-system --version 1.2.11 \
  --set providerRegex='^rock-cp-.*' \
  --set providerIpPrefixes='10.0.0.0/24' \
  --set bypassDnsResolution='true'
```
