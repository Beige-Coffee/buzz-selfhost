# Prepare to follow the steps yourself

Read the [security guidance](security.md), choose the setup and arrange operator access first.
On your computer, have a terminal with Python 3, Bash and curl (macOS or Linux). For a VPS or
own hardware, use the guide's Ubuntu 24.04 x86 baseline, check SSH access, and decide the permanent
address and network reach. A local trial needs Docker and free ports 80/443. Kubernetes needs
`kubectl` and Helm pointed at the intended cluster, x86 nodes and a default StorageClass; the
public path also needs ingress and certificate management. Its single-replica quickstart is
for evaluation, not production or high availability. The steps give the exact checks.

Commands marked for the server run in its SSH session; local key creation runs on the computer
where you will use Buzz. Stop at a failed check. Review each command before running it, especially
when it changes networking, stops a service or deletes data.

Use an existing identity's npub from Settings, Identity, Copy Buzz ID, or make a new identity on
your own computer after downloading this runbook:

```bash
python3 $SKILL/scripts/new-identity.py
```

The script prints only your public npub and the private key file's path. It does not overwrite an
existing file. Put the npub and your chosen permanent address into the page's Running on box;
never enter the private key here. Leave the recommended image unchanged. Commands with an unset
value are incomplete: fill the required fields before running them.

Import the key file into Buzz as the Join step describes, save a recoverable copy in your private
vault, then remove the temporary file. Keep the same address and relay key when restoring later.
The steps use "the user" to mean you; their scripts and checks are shared with the agent route.
