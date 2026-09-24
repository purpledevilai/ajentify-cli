import { z } from "zod";

export const ClassifyOutput = z.object({
  category: z.string().describe("The material category."),
  confidence: z.number().min(0).max(1),
});
