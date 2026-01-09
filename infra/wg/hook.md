Post-UP:
```bash
nft 'add table inet wgnat'; nft 'add table inet wgfilter'; nft add chain inet wgnat POSTROUTING '{ type nat hook postrouting priority srcnat; policy accept;}'; nft add chain inet wgfilter INPUT '{ type filter hook input priority 0; policy accept;}'; nft add chain inet wgfilter FORWARD '{ type filter hook forward priority 0; policy accept;}'; nft 'add rule inet wgnat POSTROUTING oifname {{device}} ip saddr {{ipv4Cidr}} counter masquerade'; nft 'add rule inet wgfilter INPUT udp dport {{port}} counter accept'; nft 'add rule inet wgfilter FORWARD iifname "wg0" counter accept'; nft 'add rule inet wgfilter FORWARD oifname "wg0" counter accept'; nft 'add rule inet wgnat POSTROUTING oifname {{device}} ip6 saddr {{ipv6Cidr}} counter masquerade'
```

Post-DOWN:
```bash
nft 'destroy table inet wgnat'; nft 'destroy table inet wgfilter'
```