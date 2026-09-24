import { z } from "zod";

export const SortItemInput = z.object({
  classification: z
    .enum(["cardboard", "container", "food", "garbage", "garden", "glass", "soft_plastic"])
    .describe("Material category of the item."),
});

export default SortItemInput;
