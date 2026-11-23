import skill from "virtual:skill-steps";
import { onValues, trackOf } from "../lib/values";

/**
 * What the guide was checked with, as one small line under the setup's heading (the owner's call of
 * 2026-11-11, docs/decisions.md): the app, the relay image every setup installs and, on Kubernetes,
 * the chart. No dates (owner's call of 2026-11-23: versions, not when tests ran). The image and the chart come from the skill, so they can't drift
 * from the commands. What each setup's tests cover stays one click away, in tests/README.md.
 */
const APP = "1.0.0";
const COVERAGE = "https://github.com/Beige-Coffee/buzz-selfhost/blob/main/tests/README.md";

export function mountChecked(host: HTMLElement): void {
  const draw = () => {
    const chart = trackOf().startsWith("k8s") ? ` with Helm chart ${skill.pin.chart}` : "";
    host.innerHTML = `Checked with Buzz ${APP}. Installs relay <code>${skill.pin.tag}</code>${chart}. <a href="${COVERAGE}">What's tested, and what isn't</a>`;
  };
  draw();
  onValues(draw);
}
