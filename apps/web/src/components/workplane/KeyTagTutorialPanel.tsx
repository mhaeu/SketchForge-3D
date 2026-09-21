"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { t, type MessageKey } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

const KEY_TAG_STEP_STORAGE_KEY = "sketchforge:key-tag-tutorial-step";

type TutorialDimension = {
  label: MessageKey;
  value: string;
  slider: number;
};

// The wording lives in the catalogues; the steps hold keys, because this list
// is built when the module loads and the language is chosen later.
type TutorialStep = {
  eyebrow: MessageKey;
  title: MessageKey;
  body: MessageKey;
  image: string;
  alt: MessageKey;
  dimensions?: TutorialDimension[];
  snapGrid?: string;
};

const STEPS: TutorialStep[] = [
  {
    eyebrow: "keytag.step0.eyebrow",
    title: "keytag.step0.title",
    body: "keytag.step0.body",
    image: "/assets/challenges/key-tag/01-finished-target.png",
    alt: "keytag.step0.alt",
    snapGrid: "0.5 mm",
  },
  {
    eyebrow: "keytag.step1.eyebrow",
    title: "keytag.step1.title",
    body: "keytag.step1.body",
    image: "/assets/challenges/key-tag/02-middle-box.png",
    alt: "keytag.step1.alt",
    dimensions: [
      { label: "prop.length", value: "25.50 mm", slider: 38 },
      { label: "prop.width", value: "11.50 mm", slider: 20 },
      { label: "prop.height", value: "1.00 mm", slider: 5 },
    ],
  },
  {
    eyebrow: "keytag.step2.eyebrow",
    title: "keytag.step2.title",
    body: "keytag.step2.body",
    image: "/assets/challenges/key-tag/03-left-round-end.png",
    alt: "keytag.step2.alt",
    dimensions: [
      { label: "prop.length", value: "11.50 mm", slider: 20 },
      { label: "prop.width", value: "11.50 mm", slider: 20 },
      { label: "prop.height", value: "1.00 mm", slider: 5 },
    ],
  },
  {
    eyebrow: "keytag.step3.eyebrow",
    title: "keytag.step3.title",
    body: "keytag.step3.body",
    image: "/assets/challenges/key-tag/04-right-round-end.png",
    alt: "keytag.step3.alt",
  },
  {
    eyebrow: "keytag.step4.eyebrow",
    title: "keytag.step4.title",
    body: "keytag.step4.body",
    image: "/assets/challenges/key-tag/05-select-left-circle.png",
    alt: "keytag.step4.alt",
  },
  {
    eyebrow: "keytag.step5.eyebrow",
    title: "keytag.step5.title",
    body: "keytag.step5.body",
    image: "/assets/challenges/key-tag/06-hole-cylinder.png",
    alt: "keytag.step5.alt",
    dimensions: [
      { label: "prop.length", value: "3.00 mm", slider: 8 },
      { label: "prop.width", value: "3.00 mm", slider: 8 },
      { label: "prop.height", value: "2.00 mm", slider: 7 },
    ],
  },
  {
    eyebrow: "keytag.step6.eyebrow",
    title: "keytag.step6.title",
    body: "keytag.step6.body",
    image: "/assets/challenges/key-tag/07-align-hole.png",
    alt: "keytag.step6.alt",
  },
  {
    eyebrow: "keytag.step7.eyebrow",
    title: "keytag.step7.title",
    body: "keytag.step7.body",
    image: "/assets/challenges/key-tag/08-unlock-left-circle.png",
    alt: "keytag.step7.alt",
  },
  {
    eyebrow: "keytag.step8.eyebrow",
    title: "keytag.step8.title",
    body: "keytag.step8.body",
    image: "/assets/challenges/key-tag/09-grouped-key-tag.png",
    alt: "keytag.step8.alt",
  },
];

function storedStepIndex() {
  if (typeof window === "undefined") return 0;
  const parsed = Number.parseInt(window.localStorage.getItem(KEY_TAG_STEP_STORAGE_KEY) ?? "0", 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(STEPS.length - 1, parsed)) : 0;
}

export function KeyTagTutorialPanel({
  onFinish,
  collapsed = false,
  onCollapsedChange,
}: {
  onFinish?: () => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  useLanguage();
  const [stepIndex, setStepIndex] = useState(storedStepIndex);
  const step = STEPS[stepIndex];
  const first = stepIndex === 0;
  const last = stepIndex === STEPS.length - 1;

  const goToStep = (index: number) => {
    const next = Math.max(0, Math.min(STEPS.length - 1, index));
    setStepIndex(next);
    window.localStorage.setItem(KEY_TAG_STEP_STORAGE_KEY, String(next));
  };

  if (collapsed) {
    return (
      <aside className="key-tag-tutorial-panel key-tag-tutorial-panel-collapsed" aria-label={t("keytag.panel")}>
        <button
          type="button"
          className="key-tag-tutorial-expand"
          title={t("tutorial.expand")}
          aria-label={t("tutorial.expand")}
          onClick={() => onCollapsedChange?.(false)}
        >
          <ChevronLeft size={19} />
        </button>
        <span className="key-tag-tutorial-collapsed-label">{t("keytag.name")}</span>
        <span className="key-tag-tutorial-collapsed-count">{stepIndex + 1}/{STEPS.length}</span>
      </aside>
    );
  }

  return (
    <aside
      className="key-tag-tutorial-panel"
      aria-label={t("keytag.panel")}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <header className="key-tag-tutorial-header">
        <div>
          <span>{t("keytag.challenge")}</span>
          <strong>{t("keytag.name")}</strong>
        </div>
        <div className="key-tag-tutorial-header-actions">
          <span className="key-tag-tutorial-count">{stepIndex + 1} / {STEPS.length}</span>
          <button
            type="button"
            className="key-tag-tutorial-collapse"
            title={t("tutorial.collapse")}
            aria-label={t("tutorial.collapse")}
            onClick={() => onCollapsedChange?.(true)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </header>

      <div className="key-tag-tutorial-body">
        <div className="key-tag-tutorial-copy">
          <span className="key-tag-tutorial-eyebrow">{t(step.eyebrow)}</span>
          <h2>{t(step.title)}</h2>
          <p>{t(step.body)}</p>

          {step.snapGrid ? (
            <div className="key-tag-snap-row" aria-label={`${t("inspector.snapGrid")} ${step.snapGrid}`}>
              <span>{t("inspector.snapGrid")}</span>
              <strong>{step.snapGrid}</strong>
            </div>
          ) : null}

          {step.dimensions ? (
            <div className="key-tag-tutorial-dimensions" aria-label={t("tutorial.requiredDimensions")}>
              {step.dimensions.map((dimension) => (
                <div className="key-tag-tutorial-dimension-control" key={dimension.label}>
                  <div className="key-tag-tutorial-dimension-heading">
                    <span>{t(dimension.label)}</span>
                    <strong>{dimension.value}</strong>
                  </div>
                  <div className="key-tag-tutorial-slider" aria-hidden="true">
                    <span style={{ width: `${dimension.slider}%` }} />
                    <i style={{ left: `${dimension.slider}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="key-tag-tutorial-image-box">
          <img className="key-tag-tutorial-capture" src={step.image} alt={step.alt} draggable={false} />
        </div>
      </div>

      <footer className="key-tag-tutorial-footer">
        <button type="button" className="secondary" disabled={first} onClick={() => goToStep(stepIndex - 1)}>
          <ChevronLeft size={17} /> {t("tutorial.previous")}
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => {
            if (last) {
              window.localStorage.removeItem(KEY_TAG_STEP_STORAGE_KEY);
              onFinish?.();
              return;
            }
            goToStep(stepIndex + 1);
          }}
        >
          {last ? t("tutorial.finish") : t("tutorial.next")} {!last ? <ChevronRight size={17} /> : null}
        </button>
      </footer>
    </aside>
  );
}
