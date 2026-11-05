/**
 * Fixed related-term groups for the local lexicon embedder.
 * A query stem may activate every stem in its group. The groups do not learn.
 * They are not a neural network and they are not the chat model.
 */
export const SEMANTIC_RELATION_GROUPS: readonly (readonly string[])[] = [
  ["machine", "computer", "computers", "computational", "algorithm", "algorithms", "model", "models"],
  ["learn", "learning", "learned", "learner", "train", "training", "trained"],
  ["pattern", "patterns", "identify", "identifies", "identified", "recognize", "recognizes", "recognition", "detect", "detects"],
  ["dataset", "datasets", "data"],
  ["chlorophyll", "pigment", "pigments"],
  ["absorb", "absorbs", "absorbed", "absorbing", "absorption", "capture", "captures"],
  ["sunlight", "sun", "solar"],
  ["glucose", "sugar", "sugars", "carbohydrate", "carbohydrates"],
  ["oxygen"],
  ["respiration", "respiratory", "breathing"],
  ["mitochondria", "mitochondrion"],
  ["plant", "plants", "leaf", "leaves"],
  ["energy", "energetic"],
  ["cell", "cells", "cellular"],
  ["photosynthesis", "photosynthetic"],
  ["chloroplast", "chloroplasts"],
  ["recursion", "recursive", "recurse"],
  ["function", "functions", "subroutine", "subroutines"],
  ["stack", "stacks"],
  ["python"],
  ["variable", "variables"],
  ["loop", "loops", "iteration", "iterative", "iterate"],
  ["array", "arrays", "list", "lists"],
  ["memory"],
  ["thread", "threads"],
  ["scheduler", "scheduling", "schedule", "schedules"],
  ["process", "processes"],
  ["program", "programs"],
  ["kernel"],
  ["water"],
  ["carbon", "dioxide"],
  ["reaction", "reactions"],
  ["light"],
  ["cycle", "cycles"],
  ["definition", "define", "defined", "means", "meaning"],
  ["example", "examples"],
  ["concept", "concepts"],
  ["chapter", "chapters", "section", "sections"],
];

/** Question words that should not become their own embedding features. */
export const EMBEDDER_SKIP = new Set([
  "explain",
  "describe",
  "discuss",
  "tell",
  "please",
  "according",
  "notes",
  "note",
]);
