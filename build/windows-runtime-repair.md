# Windows runtime repair

The released 1.2.0 Windows base omits directories named `data`, including
`torch/utils/data` and `torch/distributed/elastic/utils/data`. The original base
compatibility manifest also omits them, so checking that manifest alone cannot
detect the broken `import torch`.

`windows-runtime-repair.zip` contains the 53 missing Python files for this base.
Each file was retrieved from the PyTorch revision recorded by the installed
runtime and verified against the SHA-256 and length in the wheel's installed
`torch-2.15.0+cpu.dist-info/RECORD`, including Windows line endings. The source
revision, ZIP hash, individual hashes and matching `torch/__init__.py` hash are
recorded in `windows-runtime-repair.json`. The upstream license is in
`PYTORCH-LICENSE.txt`. No DLLs, wheels or architecture-dependent binaries are
included in the repair.

`stage-windows-repair.mjs` verifies and stages these files for the Windows update
and full Windows build. Mac updates have their own payload and manifest and never
include these files. Update payload paths are excluded from the legacy base
compatibility manifest because the update supplies their verified replacements.

The Windows updater checks actual runtime imports and a CPU tensor operation
inside the install transaction, so an incomplete base causes rollback rather
than a false success. Mac checks its relocated native runtime before signing and
replacing the application.

Run `test-upgrade.yml` to test both operating systems. Its optional `publish`
input replaces the existing v1.2.2 Windows ZIP, Mac ZIP and shared checksums only
after both native tests succeed. The publisher uploads and verifies replacement
assets before renaming the old assets, retaining the previous files until all
new digests match.
