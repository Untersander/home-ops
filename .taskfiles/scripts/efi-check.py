# Lists EFI Boot#### entries and flags the ones the Talos installer cannot parse.
#
# The Talos installer reads every Boot#### variable before creating its own boot entry and aborts
# on the first one it cannot decode, e.g. AMI firmware "UEFI OS" entries that declare 2 bytes more
# FilePathListLength than their device path uses ("dangling bytes at the end of device path: 0000").
# The checks mirror UnmarshalLoadOption/UnmarshalDevicePath in siderolabs/talos internal/pkg/efivarfs.
# Upstream fix: https://github.com/siderolabs/talos/pull/14575
#
# Runs inside a privileged pod on the node, which mounts its own efivarfs to read the variables.
import os
import re
import struct
import subprocess
import sys

EFI_GLOBAL = "8be4df61-93ca-11d2-aa0d-00e098032b8c"
MOUNT = "/efi"


def parse_device_paths(data):
    rest, first = data, True
    while first or rest:
        first, nodes = False, 0
        while True:
            if len(rest) < 4:
                if rest:
                    return "dangling bytes at the end of device path: %s" % rest.hex()
                if nodes == 0:
                    return "empty DevicePath without End Of Path element"
                return "DevicePath with %d elements, but without End Of Path element" % nodes
            node_type, sub_type, length = rest[0], rest[1], struct.unpack("<H", rest[2:4])[0]
            if length > len(rest):
                return "path element larger than rest of buffer: %d > %d" % (length, len(rest))
            if length < 4:
                return "path element must be at least 4 bytes, length indicates %d" % length
            rest = rest[length:]
            if node_type == 0x7F and sub_type == 0xFF:
                break
            nodes += 1
    return None


def describe(data):
    """Returns (description, error) for an EFI_LOAD_OPTION without the efivarfs attribute prefix."""
    if len(data) < 6:
        return "", "minimum 6 bytes are required, got %d" % len(data)
    path_len = struct.unpack("<H", data[4:6])[0]
    null_idx = data[6:].find(b"\x00\x00")
    if null_idx == -1:
        return "", "no null code point marking end of Description found"
    desc_end = 6 + null_idx + 1
    description = data[6:desc_end].decode("utf-16-le", errors="replace")
    desc_end += 2
    if desc_end + path_len > len(data):
        return description, "declared length of FilePath (%d) overruns available data (%d)" % (
            path_len, len(data) - desc_end)
    return description, parse_device_paths(data[desc_end:desc_end + path_len])


def main():
    if not os.path.isdir("/sys/firmware/efi"):
        print("no EFI firmware on this node, nothing to check")
        return 0
    os.makedirs(MOUNT, exist_ok=True)
    subprocess.run(["mount", "-t", "efivarfs", "-o", "ro", "efivarfs", MOUNT], check=True)

    malformed = 0
    for name in sorted(os.listdir(MOUNT)):
        # Exactly Boot + 4 hex digits, BootOrder/BootNext/BootCurrent share the prefix
        if not re.fullmatch(r"Boot[0-9A-F]{4}-" + EFI_GLOBAL, name):
            continue
        with open(os.path.join(MOUNT, name), "rb") as f:
            description, error = describe(f.read()[4:])
        if error:
            malformed += 1
            print("MALFORMED %s %r: %s" % (name[:8], description, error))
        else:
            print("ok        %s %r" % (name[:8], description))

    if malformed:
        print("%d boot entries will make the Talos installer fail, upgrade with --legacy" % malformed)
    else:
        print("clean, no boot entry the Talos installer cannot parse")
    return 0


if __name__ == "__main__":
    sys.exit(main())
