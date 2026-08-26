# Reviewed ecosystem artifacts

This directory contains reviewed DSH ecosystem artifacts that cannot be copied
directly from the prepared npm runtime.

- `dsh-at-file` is copied from commit
  `7f090d0d6a3f1d680d98d2a553d17accd190c65e` at version `0.4.0`.
- `dsh-browser` is built from commit
  `82eed45837c8878727f6231b0ca0fec2049ccc0a`. Its
  `PROVENANCE.json` records the reviewed source archive and build identities.
- `dsh-market-readonly` combines the pinned `dshmarket@1.31.1` identity with
  the exact official `dsh-plugin-catalog` snapshot recorded in its
  `PROVENANCE.json`. Studio reads this data but never loads Market's mutation
  routes.

Only package manifests, DSH patches, runtime output, licenses, and the built
Chrome extension are shipped. Tests, repository metadata, and lifecycle
scripts are intentionally excluded.
