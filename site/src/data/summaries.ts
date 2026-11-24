/**
 * What each step does, in one line, under its title in Follow the steps yourself (the owner's pick of
 * 2026-11-24: a step's title alone, like "Machine", says too little). Written from the skill's own
 * steps (compose.md, kubernetes.md, SKILL.md), keyed by the ids build/skill.ts gives them. The build
 * fails when a step has no line here, so a new step in the skill can't show up without one.
 */
export const SUMMARIES: Record<string, string> = {
  "get-skill": "Download the guide's runbook and checks to your computer, and make or find your npub.",

  "compose-1": "Check that the machine has the right system, enough memory and disk, and free ports.",
  "compose-2": "Check that your domain points at this machine, and that ports 80 and 443 reach it.",
  "compose-2P": "Put the machine on your Tailscale network, under the name it keeps for good.",
  "compose-3": "Install Docker Engine and its Compose plugin from Docker's own repository, and cap its logs.",
  "compose-4": "Download Block's Compose bundle at the version that matches the relay's image.",
  "compose-5": "Fill the bundle's passwords with random values, which never change after the first start.",
  "compose-6": "Make the relay's own key on the machine, without printing it.",
  "compose-7": "Make your npub the community's owner.",
  "compose-8": "Set your community's permanent address and the relay version, and on a server turn on phone pairing and notifications.",
  "compose-8P": "Keep the relay's ports on this machine, so the network around it can't reach them.",
  "compose-9": "Add Buzz's phone pairing service, which the bundle doesn't start on its own.",
  "compose-10": "Start the relay, and check that every part of it is up.",
  "compose-10P": "Serve the relay on your Tailscale network, with HTTPS.",
  "compose-11": "Check that you're the owner, then run the guide's relay check from your computer.",
  "compose-11P": "If other devices can't reach the relay, let them through your Tailscale access policy.",
  "compose-12": "Check the relay with the local test's own certificate, then trust that certificate on this computer.",
  "compose-moderation-console": "Turn on Buzz's moderation screens, for a community strangers can join.",
  "compose-optional-hardening": "Let only your own IP address reach SSH.",
  "compose-shutting-a-server-down": "Back up, stop the relay and clean up its address when the community ends.",
  "compose-removing-the-local-test": "Stop the local test, and delete its data and its certificate.",

  "kubernetes-1": "Check that the cluster has a default storage class, one x86 node and no earlier Buzz release, and add Traefik and cert-manager if it lacks them.",
  "kubernetes-2": "Point your domain at the cluster's load balancer.",
  "kubernetes-3": "Write the chart's values file, with the relay's image pinned and phone pairing on.",
  "kubernetes-4": "Install Block's Helm chart, and check that every pod runs.",
  "kubernetes-5": "Copy the relay's key from its Kubernetes Secret into a password manager.",
  "kubernetes-6": "Check the certificate, that you're the owner, and that the relay runs the right image.",
  "kubernetes-P1": "Turn on HTTPS, add the tags and make an OAuth client in your Tailscale admin console.",
  "kubernetes-P2": "Install Tailscale's Kubernetes operator in the cluster.",
  "kubernetes-P3": "Check that this computer is on your tailnet, and pick the relay's Tailscale name.",
  "kubernetes-P4": "Write the chart's values for your Tailscale name, then install the chart.",
  "kubernetes-P5": "Copy the relay's key from its Kubernetes Secret into a password manager.",
  "kubernetes-P6": "Check that the relay answers on its Tailscale name, and that nothing is public.",

  "skill-3": "Run the guide's checks against your relay from your computer.",
  "skill-4": "Join your community from Buzz with your key.",
};
