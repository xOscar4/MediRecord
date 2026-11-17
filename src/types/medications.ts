export type MedicationDoseForm =
  | 'tablet'
  | 'capsule'
  | 'liquid'
  | 'drops'
  | 'injection'
  | 'inhaler'
  | 'other';

export type MedicationSchedule = {
  id: string;
  medication_id: string;
  time_of_day: string;
  days_of_week: number[];
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  archived_at: string | null;
  notes: string | null;
};

export type Medication = {
  id: string;
  user_id: string;
  name: string;
  dose_amount: string | null;
  dose_form: MedicationDoseForm | null;
  instructions: string | null;
  photo_path: string | null;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  schedules: MedicationSchedule[];
};

export type MedicationCatalog = {
  active: Medication[];
  archived: Medication[];
};

export type MedicationScheduleDraft = {
  id: string;
  persistedId?: string;
  timeOfDay: string;
  daysOfWeek: number[];
  startDate: string;
  endDate: string;
  notes?: string;
};

export type MedicationRegistrationInput = {
  name: string;
  doseAmount: string;
  doseForm: MedicationDoseForm | null;
  instructions: string;
  schedules: MedicationScheduleDraft[];
};

export type MedicationDetailsInput = Omit<MedicationRegistrationInput, 'schedules'>;
