"use client";

import { AlignCenter, Box, CircleDotDashed, Group, LockKeyhole, MoveUp, Type } from "lucide-react";
import type { ChallengeTutorialId } from "@/lib/challenges";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

function KeyTagPreview() {
  return (
    <>
      <img
        className="challenge-key-tag-photo challenge-key-tag-photo-light"
        src="/assets/challenges/key-tag/card-key-tag-light.webp"
        alt={t("challenge.keyTagAlt")}
      />
      <img
        className="challenge-key-tag-photo challenge-key-tag-photo-dark"
        src="/assets/challenges/key-tag/card-key-tag-dark.webp"
        alt={t("challenge.keyTagAlt")}
      />
    </>
  );
}

function NameplatePreview() {
  return (
    <>
      <img
        className="challenge-key-tag-photo challenge-key-tag-photo-light"
        src="/assets/challenges/nameplate/card-nameplate-light.webp"
        alt={t("plate.step0.alt")}
      />
      <img
        className="challenge-key-tag-photo challenge-key-tag-photo-dark"
        src="/assets/challenges/nameplate/card-nameplate-dark.webp"
        alt={t("plate.step0.alt")}
      />
    </>
  );
}

export default function ChallengesDashboard({ onStartChallenge }: { onStartChallenge: (challenge: ChallengeTutorialId) => void }) {
  useLanguage();
  return (
    <div className="challenge-key-tag-page">
      <div className="challenge-key-tag-rail" aria-hidden="true">
        <span />
        <span />
      </div>

      <div className="challenge-card-stack">
        <article className="challenge-key-tag-card">
          <div className="challenge-key-tag-preview">
            <KeyTagPreview />
          </div>

          <div className="challenge-key-tag-content">
            <div className="challenge-key-tag-title-row">
              <span>01</span>
              <h2>{t("keytag.name")}</h2>
            </div>

            <p>{t("challenge.keyTagBlurb")}</p>

            <div className="challenge-key-tag-skills" aria-label={t("challenge.skills")}>
              <span><Box size={16} aria-hidden="true" /> {t("challenge.skillShapes")}</span>
              <span><AlignCenter size={16} aria-hidden="true" /> {t("editor.tool.align")}</span>
              <span><CircleDotDashed size={16} aria-hidden="true" /> {t("inspector.hole")}</span>
              <span><LockKeyhole size={16} aria-hidden="true" /> {t("challenge.skillLock")}</span>
              <span><Group size={16} aria-hidden="true" /> {t("editor.tool.group")}</span>
            </div>

            <button type="button" className="challenge-key-tag-start" onClick={() => onStartChallenge("key-tag")}>
              {t("challenge.start")}
            </button>
          </div>
        </article>

        <article className="challenge-key-tag-card">
          <div className="challenge-key-tag-preview">
            <NameplatePreview />
          </div>

          <div className="challenge-key-tag-content">
            <div className="challenge-key-tag-title-row">
              <span>02</span>
              <h2>{t("plate.name")}</h2>
            </div>

            <p>{t("challenge.plateBlurb")}</p>

            <div className="challenge-key-tag-skills" aria-label={t("challenge.skills")}>
              <span><Box size={16} aria-hidden="true" /> {t("shape.box")}</span>
              <span><CircleDotDashed size={16} aria-hidden="true" /> {t("editor.tool.fillet")}</span>
              <span><Type size={16} aria-hidden="true" /> {t("shape.text")}</span>
              <span><MoveUp size={16} aria-hidden="true" /> {t("prop.elevation")}</span>
              <span><AlignCenter size={16} aria-hidden="true" /> {t("editor.tool.align")}</span>
              <span><Group size={16} aria-hidden="true" /> {t("editor.tool.group")}</span>
            </div>

            <button type="button" className="challenge-key-tag-start" onClick={() => onStartChallenge("nameplate")}>
              {t("challenge.start")}
            </button>
          </div>
        </article>
      </div>
    </div>
  );
}
