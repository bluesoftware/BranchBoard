import { useState } from "react";
import { GitInfo } from "../types";
import { t } from "../i18n";
import { LogoMark } from "./Icons";

interface Props {
  git: GitInfo | null;
  onCreate: (addExamples: boolean) => void;
  onSkip: () => void;
}

export function Onboarding({ git, onCreate, onSkip }: Props) {
  const [addExamples, setAddExamples] = useState(false);

  const steps = ["step1", "step2", "step3", "step4", "step5"];

  return (
    <div className="bb-onboarding">
      <div className="bb-onboarding-card">
        <div className="bb-onboarding-mark">
          <LogoMark size={34} />
        </div>
        <h1>{t("onboarding.welcome")}</h1>
        <p className="lead">{t("onboarding.intro")}</p>

        {git?.userName && (
          <div className="bb-detected-user">
            {t("onboarding.detectedUser")}: <strong>&nbsp;{git.userName}</strong>
            {git.userEmail ? ` · ${git.userEmail}` : ""}
          </div>
        )}

        <div className="bb-steps">
          {steps.map((s, i) => (
            <div key={s} className="bb-step">
              <span className="bb-step-num">{i + 1}</span>
              <span>{t(`onboarding.${s}`)}</span>
            </div>
          ))}
        </div>

        <div className="bb-onboarding-foot">
          <label className="bb-checkbox">
            <input
              type="checkbox"
              checked={addExamples}
              onChange={(e) => setAddExamples(e.target.checked)}
            />
            {t("onboarding.addExamples")}
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="bb-btn ghost" onClick={onSkip}>
              {t("board.cancel")}
            </button>
            <button className="bb-btn accent" onClick={() => onCreate(addExamples)}>
              {t("onboarding.createBoard")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
