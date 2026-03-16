import { DefinitionItem, KeyTerm, NotesDeltaPayload, NotesState, NotesTopic } from "./types";

const uniqueAppend = (target: string[], incoming: string[]) => {
  if (incoming.length === 0) return target;
  const set = new Set(target);
  for (const item of incoming) {
    if (!set.has(item)) {
      set.add(item);
      target.push(item);
    }
  }
  return target;
};

const similarity = (a: string, b: string) => {
  if (!a || !b) return 0;
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  if (aLower === bLower) return 1;
  const shorter = aLower.length < bLower.length ? aLower : bLower;
  const longer = aLower.length < bLower.length ? bLower : aLower;
  let hits = 0;
  for (let i = 0; i < shorter.length; i += 1) {
    if (shorter[i] === longer[i]) hits += 1;
  }
  return hits / longer.length;
};

const dedupeBullets = (existing: string[], incoming: string[]) => {
  const merged = [...existing];
  for (const bullet of incoming) {
    const isDup = merged.some((prev) => similarity(prev, bullet) >= 0.82);
    if (!isDup) merged.push(bullet);
  }
  return merged;
};

export function mergeNotesDelta(current: NotesState, delta: NotesDeltaPayload): NotesState {
  const nextTopics: NotesTopic[] = current.topics.map((topic) => ({
    ...topic,
    bullets: [...topic.bullets]
  }));

  const keyTermMap = new Map<string, KeyTerm>();
  for (const item of current.keyTerms) {
    keyTermMap.set(item.term, item);
  }
  if (delta.keyTerms?.length) {
    for (const item of delta.keyTerms) {
      const existing = keyTermMap.get(item.term);
      if (!existing || item.weight > existing.weight) {
        keyTermMap.set(item.term, item);
      }
    }
  }
  const keyTerms = Array.from(keyTermMap.values())
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 18);

  const questions = [...current.questions];
  if (delta.questions?.length) {
    uniqueAppend(questions, delta.questions);
  }

  const definitionMap = new Map<string, DefinitionItem>();
  for (const item of current.definitions) {
    definitionMap.set(item.term, item);
  }
  if (delta.definitions?.length) {
    for (const item of delta.definitions) {
      definitionMap.set(item.term, item);
    }
  }
  const definitions = Array.from(definitionMap.values());

  const steps = [...current.steps];
  if (delta.steps?.length) {
    uniqueAppend(steps, delta.steps);
  }

  if (delta.topics?.length) {
    for (const topicDelta of delta.topics) {
      const existing = nextTopics.find((topic) => topic.title === topicDelta.title);
      if (existing) {
        if (topicDelta.bullets?.length) {
          existing.bullets = dedupeBullets(existing.bullets, topicDelta.bullets).slice(0, 4);
        }
      } else {
        nextTopics.push({
          title: topicDelta.title,
          bullets: topicDelta.bullets ? topicDelta.bullets.slice(0, 4) : []
        });
      }
    }
  }

  return {
    topics: nextTopics.slice(-8),
    keyTerms,
    questions,
    definitions,
    steps
  };
}
