export interface PromptSource {
  id: number;
  filename: string;
  pageNumber: number;
  content: string;
}

export interface AnswerRequest {
  system: string;
  prompt: string;
  // The same material as `prompt`, in structured form, for providers that don't read prompts.
  question: string;
  sources: PromptSource[];
}

export interface AnswerResult {
  text: string;
  // The model declined for safety reasons; `text` is empty.
  refused: boolean;
}

export abstract class LlmProvider {
  abstract readonly model: string;
  abstract answer(request: AnswerRequest): Promise<AnswerResult>;
}

export class LlmProviderError extends Error {}
