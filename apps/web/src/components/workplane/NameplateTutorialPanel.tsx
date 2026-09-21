"use client";

import { ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { useLayoutEffect, useState } from "react";
import { t, type MessageKey } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

const NAMEPLATE_STEP_STORAGE_KEY = "sketchforge:nameplate-tutorial-step";

type TutorialDimension = {
  label: MessageKey;
  value: string;
  slider: number;
};

// The steps hold keys; the wording comes from the catalogues at render time.
type TutorialStep = {
  eyebrow: MessageKey;
  title: MessageKey;
  body: MessageKey;
  image: string;
  alt: MessageKey;
  dimensions?: TutorialDimension[];
  snapGrid?: string;
  callout?: MessageKey;
};

const STEPS: TutorialStep[] = [
  {
    eyebrow: "plate.step0.eyebrow",
    title: "plate.step0.title",
    body: "plate.step0.body",
    image: "/assets/challenges/nameplate/01-finished-target.webp",
    alt: "plate.step0.alt",
    snapGrid: "0.5 mm",
  },
  {
    eyebrow: "plate.step1.eyebrow",
    title: "plate.step1.title",
    body: "plate.step1.body",
    image: "/assets/challenges/nameplate/02-base-box.webp",
    alt: "plate.step1.alt",
    dimensions: [
      { label: "prop.length", value: "24.00 mm", slider: 24 },
      { label: "prop.width", value: "70.00 mm", slider: 70 },
      { label: "prop.height", value: "3.00 mm", slider: 12 },
    ],
  },
  {
    eyebrow: "plate.step2.eyebrow",
    title: "plate.step2.title",
    body: "plate.step2.body",
    image: "/assets/challenges/nameplate/03-rounded-base.webp",
    alt: "plate.step2.alt",
    callout: "plate.calloutFillet",
  },
  {
    eyebrow: "plate.step3.eyebrow",
    title: "plate.step3.title",
    body: "plate.step3.body",
    image: "/assets/challenges/nameplate/04-text-added.webp",
    alt: "plate.step3.alt",
  },
  {
    eyebrow: "plate.step4.eyebrow",
    title: "plate.step4.title",
    body: "plate.step4.body",
    image: "/assets/challenges/nameplate/05-text-customized.webp",
    alt: "plate.step4.alt",
    dimensions: [
      { label: "prop.height", value: "2.00 mm", slider: 9 },
    ],
  },
  {
    eyebrow: "plate.step5.eyebrow",
    title: "plate.step5.title",
    body: "plate.step5.body",
    image: "/assets/challenges/nameplate/05-text-customized.webp",
    alt: "plate.step5.alt",
    dimensions: [
      { label: "prop.elevation", value: "3.00 mm", slider: 12 },
    ],
  },
  {
    eyebrow: "plate.step6.eyebrow",
    title: "plate.step6.title",
    body: "plate.step6.body",
    image: "/assets/challenges/nameplate/06-text-centered.webp",
    alt: "plate.step6.alt",
    callout: "plate.calloutLocked",
  },
  {
    eyebrow: "plate.step7.eyebrow",
    title: "plate.step7.title",
    body: "plate.step7.body",
    image: "/assets/challenges/nameplate/07-grouped-nameplate.webp",
    alt: "plate.step7.alt",
  },
];

function storedStepIndex() {
  if (typeof window === "undefined") return 0;
  const parsed = Number.parseInt(window.localStorage.getItem(NAMEPLATE_STEP_STORAGE_KEY) ?? "0", 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(STEPS.length - 1, parsed)) : 0;
}

function FilletButtonCoachmark() {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const target = document.querySelector<HTMLButtonElement>('button[data-sketchforge-tool="fillet"]');
    if (!target) return;

    const updatePosition = () => {
      const rect = target.getBoundingClientRect();
      setPosition({
        left: rect.left + rect.width / 2,
        top: rect.bottom + 42,
      });
    };

    target.classList.add("nameplate-fillet-button-target");
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const observer = new ResizeObserver(updatePosition);
    observer.observe(target);

    return () => {
      target.classList.remove("nameplate-fillet-button-target");
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      observer.disconnect();
    };
  }, []);

  if (!position) return null;

  return (
    <div className="nameplate-fillet-coachmark" style={position} role="status">
      <ArrowUp size={30} strokeWidth={3} aria-hidden="true" />
      <strong>{t("plate.clickFillet")}</strong>
    </div>
  );
}

export function NameplateTutorialPanel({
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
    window.localStorage.setItem(NAMEPLATE_STEP_STORAGE_KEY, String(next));
  };

  if (collapsed) {
    return (
      <aside className="key-tag-tutorial-panel key-tag-tutorial-panel-collapsed" aria-label={t("plate.panel")}>
        <button
          type="button"
          className="key-tag-tutorial-expand"
          title={t("tutorial.expand")}
          aria-label={t("tutorial.expand")}
          onClick={() => onCollapsedChange?.(false)}
        >
          <ChevronLeft size={19} />
        </button>
        <span className="key-tag-tutorial-collapsed-label">Nameplate</span>
        <span className="key-tag-tutorial-collapsed-count">{stepIndex + 1}/{STEPS.length}</span>
      </aside>
    );
  }

  return (
    <>
      {stepIndex === 2 ? <FilletButtonCoachmark /> : null}
      <aside
        className="key-tag-tutorial-panel"
        aria-label={t("plate.panel")}
        onPointerDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
      <header className="key-tag-tutorial-header">
        <div>
          <span>{t("plate.challenge")}</span>
          <strong>{t("plate.name")}</strong>
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

          {step.callout ? <div className="nameplate-tutorial-callout">{t(step.callout)}</div> : null}

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
              window.localStorage.removeItem(NAMEPLATE_STEP_STORAGE_KEY);
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
    </>
  );
}
