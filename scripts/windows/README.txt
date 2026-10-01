Run PowerShell scripts from the repository root.

Recommended order:
01-check-and-login.ps1
02-create-or-configure-d1.ps1
03-apply-d1.ps1
04-verify-d1.ps1
05-set-required-secrets.ps1
07-deploy-worker.ps1
08-smoke-test.ps1

Optional:
06-set-telegram-secrets.ps1
10-enable-telegram.ps1
09-export-backup.ps1

All scripts stop on the first error.
