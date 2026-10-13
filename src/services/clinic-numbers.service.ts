import { ApiError } from "../utils/errors.js";
import * as repository from "../db/repositories/clinic-numbers.repository.js";

export const listClinicNumbers = () => repository.findAll();

export const addClinicNumber = (number: string) => repository.upsert(number);

export async function ensureClinicNumberExists(number: string): Promise<void> {
  if (!(await repository.exists(number))) {
    throw ApiError.validation([{ field: "clinicNumber", message: "Select a clinic number from the list." }]);
  }
}
