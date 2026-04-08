"use client";

import { useEffect, useMemo, useState } from "react";
import { getFoodImageUrl, QUESTION_POOL, shuffleArray, type QuestionItem } from "@/lib/questions";
import { supabase } from "@/lib/supabase";

type Screen = "consent" | "demographics" | "quiz" | "round-complete" | "thank-you";

type Demographics = {
  name: string;
  email: string;
  institution: string;
  institutionOther: string;
  ageGroup: string;
  gender: string;
  profession: string;
  ingredientFamiliarity: number;
};

type PendingResponse = {
  round_number: number;
  question_number: number;
  ingredient: string;
  option_a: string;
  option_b: string;
  gastrograph_option: "A" | "B";
  selected_option: "A" | "B";
  selected_ingredient: string;
  is_gastrograph_selected: boolean;
  response_time_ms: number;
};

const STORAGE_KEY = "gastrograph-study-state";

const institutions = [
  "Le Cordon Bleu Gurgaon",
  "IHM Pusa",
  "Symbiosis Culinary School",
  "Other",
];

const roleByInstitution: Record<string, string> = {
  "Le Cordon Bleu Gurgaon": "Culinary Student",
  "IHM Pusa": "Culinary Student",
  "Symbiosis Culinary School": "Culinary Student",
  Other: "Chef",
};

const professions = [
  "Chef",
  "Culinary Student",
  "Culinary Instructor",
  "Food Scientist",
  "Home Cook",
  "Other",
];

const ageGroups = ["18–24", "25–34", "35–44", "45–54", "55+"];


function OptionCard({
  label,
  ingredient,
  selected,
  onSelect,
}: {
  label: "A" | "B";
  ingredient: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative w-full card p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C1440E] ${
        selected ? "border-2 border-[#C1440E] bg-[#FFF3EE]" : "border-2 border-transparent"
      }`}
      aria-pressed={selected}
      aria-label={`Select option ${label}, ${ingredient}`}
    >
      <p className="option-chip text-xs text-[#6B5E57]">OPTION {label}</p>
      <div className="mt-2 overflow-hidden rounded-xl bg-[#F4EEE7] aspect-square">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={getFoodImageUrl(ingredient)}
          alt={ingredient}
          className="h-full w-full object-cover"
        />
      </div>
      <p className="mt-3 option-chip text-sm text-[#2C2420]">{ingredient.toUpperCase()}</p>
      {selected && (
        <span className="absolute right-4 top-4 rounded-full bg-[#C1440E] px-2 py-1 text-xs font-semibold text-white transition-transform duration-200">
          ✓
        </span>
      )}
    </button>
  );
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("consent");
  const [consent, setConsent] = useState([false, false, false]);
  const [demographics, setDemographics] = useState<Demographics>({
    name: "",
    email: "",
    institution: "",
    institutionOther: "",
    ageGroup: "",
    gender: "",
    profession: "",
    ingredientFamiliarity: 0,
  });

  const [sessionId, setSessionId] = useState<string>("");
  const [roundNumber, setRoundNumber] = useState(1);
  const [questionOrder, setQuestionOrder] = useState<number[]>([]);
  const [questionIndexInRound, setQuestionIndexInRound] = useState(0);
  const [selectedOption, setSelectedOption] = useState<"A" | "B" | null>(null);
  const [selectionReady, setSelectionReady] = useState(false);
  const [pendingResponses, setPendingResponses] = useState<PendingResponse[]>([]);
  const [questionStartTime, setQuestionStartTime] = useState<number>(Date.now());
  const [saveMessage, setSaveMessage] = useState<string>("");

  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      setScreen(parsed.screen ?? "consent");
      setDemographics(parsed.demographics ?? demographics);
      setSessionId(parsed.sessionId ?? "");
      setRoundNumber(parsed.roundNumber ?? 1);
      setQuestionOrder(parsed.questionOrder ?? []);
      setQuestionIndexInRound(parsed.questionIndexInRound ?? 0);
      setPendingResponses(parsed.pendingResponses ?? []);
      setQuestionStartTime(parsed.questionStartTime ?? Date.now());
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        screen,
        demographics,
        sessionId,
        roundNumber,
        questionOrder,
        questionIndexInRound,
        pendingResponses,
        questionStartTime,
      }),
    );
  }, [screen, demographics, sessionId, roundNumber, questionOrder, questionIndexInRound, pendingResponses, questionStartTime]);

  const currentQuestionPoolIndex = questionOrder[questionIndexInRound];
  const currentQuestion: QuestionItem | undefined =
    currentQuestionPoolIndex !== undefined ? QUESTION_POOL[currentQuestionPoolIndex] : undefined;

  const shuffledOptions = useMemo(() => {
    if (!currentQuestion) return null;
    const picks = shuffleArray([
      { option: "A" as const, value: currentQuestion.gastrograph_sub, source: "g" as const },
      { option: "B" as const, value: currentQuestion.embedding_sub, source: "e" as const },
    ]);

    const optionA = picks[0].value;
    const optionB = picks[1].value;
    const gastrographOption: "A" | "B" = picks[0].source === "g" ? "A" : "B";

    return { ingredient: currentQuestion.ingredient, optionA, optionB, gastrographOption };
  }, [currentQuestion]);

  const allConsentChecked = consent.every(Boolean);
  const demographicsValid =
    demographics.name.trim().length > 0 &&
    demographics.institution.trim().length > 0 &&
    demographics.ageGroup.trim().length > 0 &&
    demographics.gender.trim().length > 0 &&
    demographics.profession.trim().length > 0 &&
    demographics.ingredientFamiliarity >= 1 &&
    (demographics.institution !== "Other" || demographics.institutionOther.trim().length > 0);

  const handleStartStudy = async () => {
    const generatedSessionId = crypto.randomUUID();
    setSessionId(generatedSessionId);

    if (supabase) {
      const { error } = await supabase.from("participants").insert({
        name: demographics.name,
        email: demographics.email || null,
        institution:
          demographics.institution === "Other"
            ? demographics.institutionOther
            : demographics.institution,
        age_group: demographics.ageGroup,
        gender: demographics.gender,
        profession: demographics.profession,
        ingredient_familiarity: demographics.ingredientFamiliarity,
        session_id: generatedSessionId,
      });

      if (error) {
        setSaveMessage("Could not save participant details to Supabase. Responses will stay in this browser session.");
      }
    } else {
      setSaveMessage("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    }

    const initialOrder = shuffleArray([...Array(QUESTION_POOL.length).keys()]);
    setQuestionOrder(initialOrder);
    setQuestionIndexInRound(0);
    setQuestionStartTime(Date.now());
    setScreen("quiz");
  };

  const handleSelectOption = (option: "A" | "B") => {
    setSelectedOption(option);
    setSelectionReady(false);
    setTimeout(() => setSelectionReady(true), 250);
  };

  const handleNextQuestion = () => {
    if (!shuffledOptions || !selectedOption) return;

    const selectedIngredient = selectedOption === "A" ? shuffledOptions.optionA : shuffledOptions.optionB;

    const response: PendingResponse = {
      round_number: roundNumber,
      question_number: questionIndexInRound + 1,
      ingredient: shuffledOptions.ingredient,
      option_a: shuffledOptions.optionA,
      option_b: shuffledOptions.optionB,
      gastrograph_option: shuffledOptions.gastrographOption,
      selected_option: selectedOption,
      selected_ingredient: selectedIngredient,
      is_gastrograph_selected: selectedOption === shuffledOptions.gastrographOption,
      response_time_ms: Date.now() - questionStartTime,
    };

    setPendingResponses((prev) => [...prev, response]);
    setSelectedOption(null);
    setSelectionReady(false);

    if (questionIndexInRound % 10 === 9) {
      setScreen("round-complete");
      return;
    }

    setQuestionIndexInRound((prev) => prev + 1);
    setQuestionStartTime(Date.now());
  };

  const handleBack = () => {
    if (questionIndexInRound % 10 === 0) return; // can't go back past start of round
    // restore previously selected option from the response we're undoing
    const previousResponse = pendingResponses[pendingResponses.length - 1];
    setSelectedOption(previousResponse?.selected_option ?? null);
    setSelectionReady(true); // already made a choice before, allow Next immediately
    setQuestionIndexInRound((prev) => prev - 1);
    setQuestionStartTime(Date.now());
    // remove the last saved response for this round
    setPendingResponses((prev) => prev.slice(0, -1));
  };

  const persistRoundResponses = async () => {
    if (!supabase || !sessionId || pendingResponses.length === 0) {
      return;
    }

    const payload = pendingResponses.map((item) => ({
      session_id: sessionId,
      ...item,
    }));

    const { error } = await supabase.from("responses").insert(payload);

    if (error) {
      setSaveMessage("Save failed for this round. Please keep this tab open and try submitting again.");
      return;
    }

    setPendingResponses([]);
  };

  const handleContinueRound = async () => {
    await persistRoundResponses();
    const nextRound = roundNumber + 1;
    const nextIndex = roundNumber * 10; // start index of next round
    if (nextRound > 10 || nextIndex >= Math.min(questionOrder.length, 100)) {
      sessionStorage.removeItem(STORAGE_KEY);
      setScreen("thank-you");
      return;
    }

    setRoundNumber(nextRound);
    setQuestionIndexInRound(nextIndex);
    setQuestionStartTime(Date.now());
    setScreen("quiz");
  };

  const handleSubmit = async () => {
    await persistRoundResponses();
    sessionStorage.removeItem(STORAGE_KEY);
    setScreen("thank-you");
  };

  if (screen === "consent") {
    return (
      <main className="mx-auto min-h-screen w-full max-w-[900px] p-6 md:p-10">
        <section className="card mt-8 p-8">
          <h1 className="text-3xl text-[#2C2420]">GastroGraph: Culinary Expert Evaluation Study</h1>
          <p className="mt-3 text-sm text-[#6B5E57]">Conducted by: GastroGraph Research Team · IIIT Delhi (2026-27)</p>
          <p className="mt-4 text-[#6B5E57]">We are conducting a research study on ingredient substitution in cooking. You will be presented with pairs of possible substitutes for common ingredients and asked to judge which is the more appropriate culinary replacement, drawing solely on your expertise.</p>

          <div className="mt-8 space-y-3">
            {[
              "I understand this is a voluntary research study and I may stop at any time.",
              "My responses will be stored anonymously and used only for research purposes.",
              "I am 18 years of age or older.",
            ].map((text, idx) => (
              <label key={text} className="flex items-start gap-3 text-[#2C2420]">
                <input
                  type="checkbox"
                  checked={consent[idx]}
                  onChange={(e) =>
                    setConsent((prev) => prev.map((it, i) => (i === idx ? e.target.checked : it)))
                  }
                  className="mt-1 h-4 w-4 accent-[#C1440E]"
                />
                <span>{text}</span>
              </label>
            ))}
          </div>

          <div className="mt-8 rounded-xl border border-[#EEE3D8] bg-[#FFFCF9] p-5 text-[#6B5E57]">
            <h2 className="text-xl text-[#2C2420]">How it works</h2>
            <p className="mt-3">
              You will be shown one ingredient at a time. For each ingredient, two possible substitutes (Option A and Option B) are displayed - each with a photograph and name. Based on your culinary knowledge, select the substitute you consider more appropriate.
            </p>
            <p className="mt-3">
              There are no right or wrong answers - we are interested in your expert judgement. After every 10 ingredients your responses are saved automatically. You may then continue with the next set or stop and submit at any point.
            </p>
            <p className="mt-3">
              The identity and source of each option are not disclosed; please evaluate them purely on culinary merit.
            </p>
          </div>

          <button
            disabled={!allConsentChecked}
            onClick={() => setScreen("demographics")}
            className="button-primary mt-8 rounded-xl px-6 py-3 font-semibold"
          >
            Begin Study →
          </button>
        </section>
      </main>
    );
  }

  if (screen === "demographics") {
    return (
      <main className="mx-auto min-h-screen w-full max-w-[900px] p-6 md:p-10">
        <section className="card mt-8 p-8">
          <h1 className="text-3xl text-[#2C2420]">Demographics</h1>
          {saveMessage && <p className="mt-2 text-sm text-[#A55732]">{saveMessage}</p>}

          <div className="mt-6 grid gap-4">
            <input
              className="rounded-lg border border-[#E4D7CA] bg-white px-4 py-3"
              placeholder="Full Name"
              value={demographics.name}
              onChange={(e) => setDemographics((prev) => ({ ...prev, name: e.target.value }))}
            />
            <input
              className="rounded-lg border border-[#E4D7CA] bg-white px-4 py-3"
              placeholder="Email (optional)"
              type="email"
              value={demographics.email}
              onChange={(e) => setDemographics((prev) => ({ ...prev, email: e.target.value }))}
            />
            <select
              className="rounded-lg border border-[#E4D7CA] bg-white px-4 py-3"
              value={demographics.institution}
              onChange={(e) => {
                const value = e.target.value;
                setDemographics((prev) => ({
                  ...prev,
                  institution: value,
                  profession: prev.profession || roleByInstitution[value] || prev.profession,
                }));
              }}
            >
              <option value="">Institution / Affiliation</option>
              {institutions.map((inst) => (
                <option key={inst} value={inst}>
                  {inst}
                </option>
              ))}
            </select>

            {demographics.institution === "Other" && (
              <input
                className="rounded-lg border border-[#E4D7CA] bg-white px-4 py-3"
                placeholder="Specify institution"
                value={demographics.institutionOther}
                onChange={(e) =>
                  setDemographics((prev) => ({ ...prev, institutionOther: e.target.value }))
                }
              />
            )}

            <fieldset>
              <legend className="mb-2 text-sm text-[#6B5E57]">Age Group</legend>
              <div className="flex flex-wrap gap-4">
                {ageGroups.map((age) => (
                  <label key={age} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="age"
                      checked={demographics.ageGroup === age}
                      onChange={() => setDemographics((prev) => ({ ...prev, ageGroup: age }))}
                      className="accent-[#C1440E]"
                    />
                    <span>{age}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-sm text-[#6B5E57]">Gender</legend>
              <div className="flex flex-wrap gap-4">
                {["Male", "Female", "Non-binary", "Prefer not to say"].map((g) => (
                  <label key={g} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="gender"
                      checked={demographics.gender === g}
                      onChange={() => setDemographics((prev) => ({ ...prev, gender: g }))}
                      className="accent-[#C1440E]"
                    />
                    <span>{g}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <select
              className="rounded-lg border border-[#E4D7CA] bg-white px-4 py-3"
              value={demographics.profession}
              onChange={(e) => setDemographics((prev) => ({ ...prev, profession: e.target.value }))}
            >
              <option value="">Profession / Role</option>
              {professions.map((profession) => (
                <option key={profession} value={profession}>
                  {profession}
                </option>
              ))}
            </select>

            <fieldset>
              <legend className="mb-2 text-sm text-[#6B5E57]">Familiarity with a wide range of ingredients</legend>
              <div className="flex items-center gap-3">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      setDemographics((prev) => ({ ...prev, ingredientFamiliarity: value }))
                    }
                    className={`rounded-md px-3 py-2 text-sm ${
                      demographics.ingredientFamiliarity === value
                        ? "bg-[#C1440E] text-white"
                        : "bg-[#F2E9E1] text-[#6B5E57]"
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <button
            disabled={!demographicsValid}
            onClick={handleStartStudy}
            className="button-primary mt-8 rounded-xl px-6 py-3 font-semibold"
          >
            Start the Study →
          </button>
        </section>
      </main>
    );
  }

  if (screen === "round-complete") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[900px] items-center p-6 md:p-10">
        <section className="card w-full p-8 text-center">
          <h1 className="text-3xl text-[#2C2420]">Round {roundNumber} Complete!</h1>
          <p className="mt-4 text-[#6B5E57]">Your responses have been saved. Thank you for contributing to our research.</p>
          {saveMessage && <p className="mt-3 text-sm text-[#A55732]">{saveMessage}</p>}
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <button onClick={handleContinueRound} className="button-primary rounded-xl px-6 py-3 font-semibold">
              Answer 10 More Ingredients
            </button>
            <button onClick={handleSubmit} className="rounded-xl border border-[#C1440E] px-6 py-3 text-[#C1440E]">
              I&apos;m Done - Submit
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (screen === "thank-you") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[900px] items-center p-6 md:p-10">
        <section className="card w-full p-8 text-center">
          <h1 className="text-3xl text-[#2C2420]">Thank You for Your Contribution</h1>
          <p className="mt-4 text-[#6B5E57]">Your culinary expertise is invaluable to this research. The results of this study will be used to evaluate ingredient substitution quality at IIIT Delhi (Bachelor&apos;s Thesis, 2026-27).</p>
          <p className="mt-6 text-sm text-[#6B5E57]">- GastroGraph Research Team, IIIT Delhi</p>
        </section>
      </main>
    );
  }

  if (!shuffledOptions) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-[900px] p-6">Loading...</main>
    );
  }

  const questionOfRound = ((questionIndexInRound % 10) + 1);
  const progressWidth = `${questionOfRound * 10}%`;

  return (
    <main className="mx-auto min-h-screen w-full max-w-[900px] p-6 md:p-10">
      <div className="mt-2 flex items-center justify-between text-sm text-[#6B5E57]">
        <p>Question {questionOfRound} of 10</p>
        <p>Round {roundNumber}</p>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-[#E5DBD2]">
        <div
          className="h-full rounded-full bg-[#C1440E] transition-all duration-300"
          style={{ width: progressWidth }}
        />
      </div>

      <section className="card mt-6 p-6 md:p-8">
        <h1 className="text-center text-2xl text-[#2C2420]">Which would you choose as a substitute?</h1>

        <p className="mt-8 text-center text-sm text-[#6B5E57]">Original ingredient:</p>
        <div className="mx-auto mt-3 w-full max-w-[280px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getFoodImageUrl(shuffledOptions.ingredient)}
            alt={shuffledOptions.ingredient}
            className="w-full rounded-xl object-cover aspect-square"
          />
          <p className="mt-3 text-center option-chip text-base">{shuffledOptions.ingredient.toUpperCase()}</p>
        </div>



        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <OptionCard
            key={`A-${shuffledOptions.optionA}-${questionIndexInRound}`}
            label="A"
            ingredient={shuffledOptions.optionA}
            selected={selectedOption === "A"}
            onSelect={() => handleSelectOption("A")}
          />
          <OptionCard
            key={`B-${shuffledOptions.optionB}-${questionIndexInRound}`}
            label="B"
            ingredient={shuffledOptions.optionB}
            selected={selectedOption === "B"}
            onSelect={() => handleSelectOption("B")}
          />
        </div>

        <div className="mt-8 flex items-center justify-between gap-3">
          <button
            onClick={handleBack}
            disabled={questionIndexInRound % 10 === 0}
            className={`rounded-xl border px-5 py-3 font-semibold transition ${
              questionIndexInRound % 10 === 0
                ? "border-[#D8CCC2] text-[#B0A49A] cursor-not-allowed"
                : "border-[#C1440E] text-[#C1440E] hover:bg-[#FFF3EE]"
            }`}
          >
            &larr; Back
          </button>
          <button
            disabled={!selectedOption || !selectionReady}
            onClick={handleNextQuestion}
            className={`rounded-xl px-6 py-3 font-semibold transition ${
              selectedOption && selectionReady
                ? "button-primary animate-pulse"
                : "bg-[#D8CCC2] text-[#76685E]"
            }`}
          >
            {selectedOption ? "Next →" : "Select an option to continue"}
          </button>
        </div>
      </section>
    </main>
  );
}
