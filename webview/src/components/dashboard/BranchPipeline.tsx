import { BranchPipelineStages, StageState } from "../../types";
import { t } from "../../i18n";

interface Props {
  stages: BranchPipelineStages;
}

const ORDER: Array<keyof BranchPipelineStages> = [
  "task",
  "branch",
  "commits",
  "push",
  "dev",
  "review",
  "testing",
  "merge",
];

function stateClass(s: StageState): string {
  return `state-${s}`;
}

/** Task → Branch → Commits → Push → DEV → Review → Testing → Merge capsule rail. */
export function BranchPipeline({ stages }: Props) {
  return (
    <div className="bb-pipeline" role="list">
      {ORDER.map((key, i) => (
        <div className="bb-pipeline-step" key={key} role="listitem">
          <span
            className={`bb-pipeline-dot ${stateClass(stages[key])}`}
            title={`${t(`cc.stage.${key}`)} — ${t(`cc.stageState.${stages[key]}`)}`}
          />
          <span className="bb-pipeline-label">{t(`cc.stage.${key}`)}</span>
          {i < ORDER.length - 1 && <span className="bb-pipeline-line" aria-hidden="true" />}
        </div>
      ))}
    </div>
  );
}
