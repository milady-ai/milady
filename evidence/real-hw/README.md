# Real-hardware boot evidence

This directory holds evidence collected from booting elizaOS Live ISOs on
real machines (not QEMU). See
`packages/os/linux/elizaos/docs/real-hw-flash-test-runbook.md` for the
collection workflow.

Each session lives in a UTC-timestamped subdirectory containing the files
written by `elizaos-real-hw-evidence.service` (env.txt, dmesg.log,
journal.log, kiosk-NN.png) plus a phone photo of the screen and the flash
install log.
