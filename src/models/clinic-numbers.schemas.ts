import { z } from "zod";
import { phoneNumberSchema } from "../utils/validation.js";

export const createClinicNumberSchema = z.strictObject({
  number: phoneNumberSchema("Clinic Number"),
});
