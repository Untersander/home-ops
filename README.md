# K8s Garden Homelab Configuration
This repository contains the configuration for my homelab. It is run on [Talos](https://www.talos.dev/) and managed with [Flux](https://fluxcd.io/).

For more information check out the official documentation:
- [Talos Documentation](https://www.talos.dev/latest/)
- [Flux Documentation](https://fluxcd.io/flux/)

## Network

A single Talos node (`cp-0`) is router, firewall and Kubernetes cluster:

Physical network layout:

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/network-physical-dark.gif">
  <img alt="Animated physical network layout: Init7 internet at 25 Gbps into cp-0, which connects the access point (2.5 Gbps) and a gaming desktop (25 Gbps)." src="./docs/network-physical-light.gif">
</picture>

Logical network layout inside:

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/network-inside-dark.gif">
  <img alt="Animated view inside cp-0: internet and LAN traffic both pass nftables. The WAN chain only lets WireGuard and a game server in and masquerades outbound IPv4, the br0 LAN chain accepts everything. Behind it the LAN reaches Pi-hole (DNS, DHCP), the Envoy Gateway in front of the apps, NFS and SMB through Cilium L2 announced IPs." src="./docs/network-inside-light.gif">
</picture>

<!-- Network topology simplified:

![Network Topology](./network-topology.drawio.svg) -->
