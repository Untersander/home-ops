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