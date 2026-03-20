
import React, { useState, useMemo } from 'react';
import { checkDrugInteractions } from '../services/geminiService';
import { EcgInterpreter } from './EcgInterpreter';
import { 
    X, 
    Calculator, 
    Activity, 
    Stethoscope, 
    Droplets, 
    ClipboardList, 
    Zap, 
    AlertTriangle, 
    Info, 
    ChevronRight, 
    Search, 
    CheckCircle2, 
    AlertCircle,
    ArrowRight,
    Pill,
    Scale,
    Clock,
    ShieldAlert,
    FileText
} from 'lucide-react';

interface ClinicalToolsModalProps {
    isOpen: boolean;
    onClose: () => void;
    T: Record<string, any>;
    language: string;
}

type ActiveTab = 'paediatricDrug' | 'adultDrug' | 'fluid' | 'scoring' | 'electrolytes' | 'ecg';

// --- DRUG DATA TYPES ---

interface Drug {
    name: string;
    doseText: string;
    concentration?: string;
    maxDose?: string;
    notes?: string;
    coverage?: string;
    adverseEvents?: string[];
    calculation?: (weight: number) => {
        dose?: number;
        unit: string;
        volume?: number;
        volumeUnit?: string;
        notes?: string;
    };
    infusionCalculation?: (weight: number) => {
        rate: string;
        preparation: string;
        notes: string;
    };
}

// --- DRUG DATABASES ---

const adultDrugDatabase: Drug[] = [
    {
        name: 'Adenosine',
        doseText: '6 mg rapid IV push; followed by 12 mg if unsuccessful',
        concentration: '3 mg/mL',
        notes: 'Administer into a large vein (e.g., antecubital) followed by a rapid 20mL saline flush.',
        adverseEvents: ['Transient asystole', 'Chest pain/pressure', 'Dyspnea'],
        calculation: () => ({ dose: 6, unit: 'mg', volume: 2, volumeUnit: 'mL', notes: 'Initial dose 6mg. If no effect in 1-2 min, give 12mg.' })
    },
    {
        name: 'Adrenaline (Epinephrine) 1:10,000 (Cardiac Arrest)',
        doseText: '1 mg every 3-5 minutes',
        concentration: '1 mg / 10 mL (100 mcg/mL)',
        adverseEvents: ['Severe Hypertension', 'Ventricular Tachyarrhythmias', 'Myocardial Ischemia'],
        calculation: () => ({ dose: 1, unit: 'mg', volume: 10, volumeUnit: 'mL' })
    },
    {
        name: 'Adrenaline (Epinephrine) 1:1,000 (Anaphylaxis)',
        doseText: '0.5 mg IM',
        concentration: '1 mg / 1 mL (1,000 mcg/mL)',
        adverseEvents: ['Severe Hypertension', 'Ventricular Tachyarrhythmias', 'Myocardial Ischemia'],
        calculation: () => ({ dose: 0.5, unit: 'mg', volume: 0.5, volumeUnit: 'mL', notes: 'Repeat every 5-15 min if no improvement.' })
    },
    {
        name: 'Amiodarone (Cardiac Arrest)',
        doseText: '300 mg IV/IO bolus; second dose 150 mg',
        concentration: '50 mg/mL',
        notes: 'For shock-refractory VF/pVT.',
        adverseEvents: ['Hypotension', 'Bradycardia', 'QT Prolongation'],
        calculation: () => ({ dose: 300, unit: 'mg', volume: 6, volumeUnit: 'mL' })
    },
    {
        name: 'Amoxicillin',
        doseText: '500 mg - 1 g every 8 hours',
        concentration: '500 mg tablets or IV',
        maxDose: 'Max 6 g/day in severe infections',
        notes: 'Adjust dose in severe renal impairment.',
        adverseEvents: ['Hypersensitivity/Anaphylaxis', 'Diarrhea', 'Drug-induced Liver Injury'],
        calculation: () => ({ dose: 500, unit: 'mg', notes: 'Standard dose is 500mg-1g TDS.' })
    },
    {
        name: 'Atracurium',
        doseText: '0.5 mg/kg for intubation',
        concentration: '10 mg/mL',
        adverseEvents: ['Histamine Release (Hypotension)', 'Bronchospasm', 'Skin Flushing'],
        calculation: (weight) => {
            const dose = 0.5 * weight;
            return { dose, unit: 'mg', volume: dose / 10, volumeUnit: 'mL' };
        }
    },
    {
        name: 'Atropine',
        doseText: '0.5 - 1 mg IV every 3-5 minutes',
        concentration: '0.6 mg/mL or 1 mg/mL',
        maxDose: 'Total max 3 mg (asystole/bradycardia)',
        adverseEvents: ['Tachycardia', 'Delirium/Confusion', 'Urinary Retention'],
        calculation: () => ({ dose: 0.5, unit: 'mg', notes: 'Standard dose for bradycardia.' })
    },
    {
        name: 'Bupivacaine 0.5% Heavy (Spinal)',
        doseText: '10 - 20 mg (2 - 4 mL)',
        concentration: '5 mg/mL in 8% Dextrose',
        notes: 'Adjust based on patient height and desired block level.',
        adverseEvents: ['Hypotension', 'High Spinal Block (Respiratory failure)', 'Bradycardia'],
        calculation: () => ({ dose: 15, unit: 'mg', volume: 3, volumeUnit: 'mL', notes: 'Example dose for T10 block.' })
    },
    {
        name: 'Dantrolene',
        doseText: '2.5 mg/kg IV bolus',
        concentration: '0.33 mg/mL (reconstituted)',
        notes: 'For Malignant Hyperthermia. Reconstitute 20mg vial with 60mL sterile water.',
        adverseEvents: ['Severe Muscle Weakness', 'Hepatotoxicity', 'Respiratory Insufficiency'],
        calculation: (weight) => {
            const dose = 2.5 * weight;
            return { dose, unit: 'mg', volume: dose / 0.33, volumeUnit: 'mL' };
        }
    },
    {
        name: 'Dexamethasone',
        doseText: '4 - 8 mg IV/IM',
        concentration: '4 mg/mL',
        notes: 'Used for PONV prophylaxis, airway edema, or inflammation.',
        adverseEvents: ['Hyperglycemia', 'Psychotic reactions', 'Perianal Pruritus (IV bolus)'],
        calculation: () => ({ dose: 4, unit: 'mg', volume: 1, volumeUnit: 'mL' })
    },
    {
        name: 'Dexmedetomidine',
        doseText: 'Load: 1 mcg/kg over 10 min; Infusion: 0.2 - 1.0 mcg/kg/hr',
        concentration: '100 mcg/mL',
        adverseEvents: ['Bradycardia', 'Hypotension', 'Hypertension (loading bolus)'],
        calculation: (weight) => ({ dose: 1 * weight, unit: 'mcg', notes: 'Loading dose.' }),
        infusionCalculation: (weight) => ({
            rate: '0.2-1.0 mcg/kg/hr',
            preparation: '4 mcg/mL (200mcg in 50mL NS)',
            notes: `Calculated Rate: ${(0.2 * weight / 4).toFixed(1)} - ${(1.0 * weight / 4).toFixed(1)} mL/hr.`
        })
    },
    {
        name: 'Diclofenac',
        doseText: '75 mg IM or 50 mg PO',
        concentration: '75 mg / 3 mL ampoule',
        maxDose: 'Max 150 mg/day',
        adverseEvents: ['GI Bleeding/Ulceration', 'Acute Kidney Injury', 'Platelet Dysfunction'],
        calculation: () => ({ dose: 75, unit: 'mg', volume: 3, volumeUnit: 'mL' })
    },
    {
        name: 'Ephedrine',
        doseText: '3 - 6 mg IV bolus',
        concentration: '3 mg/mL (diluted from 30mg ampoule)',
        notes: 'Titrate to effect for hypotension.',
        adverseEvents: ['Tachycardia', 'Arrhythmias', 'Hypertension'],
        calculation: () => ({ unit: 'mg', notes: 'Standard bolus: 3-6mg. Repeat as necessary.' })
    },
    {
        name: 'Esmolol',
        doseText: 'Load: 500 mcg/kg over 1 min; Infusion: 50 - 300 mcg/kg/min',
        concentration: '10 mg/mL',
        adverseEvents: ['Hypotension', 'Bradycardia', 'Bronchospasm'],
        calculation: (weight) => ({ dose: 500 * weight, unit: 'mcg', notes: 'Loading dose over 60 seconds.' }),
        infusionCalculation: (weight) => ({
            rate: '50-300 mcg/kg/min',
            preparation: 'Undiluted (10 mg/mL)',
            notes: `Calculated Rate: ${(50 * weight * 60 / 10000).toFixed(1)} - ${(300 * weight * 60 / 10000).toFixed(1)} mL/hr.`
        })
    },
    {
        name: 'Fentanyl',
        doseText: '1 - 2 mcg/kg for induction',
        concentration: '50 mcg/mL',
        adverseEvents: ['Respiratory Depression', 'Chest Wall Rigidity', 'Bradycardia'],
        calculation: (weight) => {
            const dose = 1.5 * weight;
            return { dose, unit: 'mcg', volume: dose / 50, volumeUnit: 'mL' };
        }
    },
    {
        name: 'Ibuprofen',
        doseText: '400 mg every 6-8 hours',
        maxDose: 'Max 2.4 g/day',
        adverseEvents: ['GI Bleeding', 'Renal Impairment', 'Bronchospasm (Aspirin sensitivity)'],
        calculation: () => ({ dose: 400, unit: 'mg' })
    },
    {
        name: 'Intralipid 20%',
        doseText: 'Bolus: 1.5 mL/kg; Infusion: 0.25 mL/kg/min',
        notes: 'LAST Protocol. Can repeat bolus x2.',
        adverseEvents: ['Hypertriglyceridemia', 'Pancreatitis', 'Laboratory interference (lipemia)'],
        calculation: (weight) => ({ dose: 0, unit: 'mL', volume: 1.5 * weight, volumeUnit: 'mL', notes: 'Bolus over 1 min.' }),
        infusionCalculation: (weight) => ({
            rate: '0.25 mL/kg/min',
            preparation: 'Undiluted 20% lipid emulsion',
            notes: `Initial rate: ${(0.25 * weight * 60).toFixed(0)} mL/hr.`
        })
    },
    {
        name: 'Ketamine (Analgesia)',
        doseText: '0.1 - 0.3 mg/kg IV',
        concentration: '10 mg/mL or 50 mg/mL',
        adverseEvents: ['Dissociation/Hallucinations', 'Laryngospasm', 'Hypertension/Tachycardia'],
        calculation: (weight) => ({ dose: 0.2 * weight, unit: 'mg', notes: 'Sub-dissociative dose.' })
    },
    {
        name: 'Ketamine (Induction)',
        doseText: '1 - 2 mg/kg IV',
        concentration: '10 mg/mL or 50 mg/mL',
        adverseEvents: ['Dissociation/Hallucinations', 'Laryngospasm', 'Hypertension/Tachycardia'],
        calculation: (weight) => ({ dose: 1.5 * weight, unit: 'mg' })
    },
    {
        name: 'Magnesium Sulphate',
        doseText: '2 g IV over 10-20 minutes',
        concentration: '500 mg/mL (50%)',
        notes: 'Dilute to 10-20% for administration.',
        adverseEvents: ['Hypotension', 'Loss of Deep Tendon Reflexes', 'Respiratory Depression'],
        calculation: () => ({ dose: 2000, unit: 'mg', volume: 4, volumeUnit: 'mL', notes: 'Standard dose for arrhythmias or asthma.' })
    },
    {
        name: 'Metronidazole',
        doseText: '500 mg every 8 hours',
        concentration: '500 mg / 100 mL IV',
        adverseEvents: ['Seizures', 'Peripheral Neuropathy', 'Disulfiram-like reaction'],
        calculation: () => ({ dose: 500, unit: 'mg', volume: 100, volumeUnit: 'mL' })
    },
    {
        name: 'Midazolam (Sedation)',
        doseText: '0.5 - 2 mg titrated IV',
        concentration: '1 mg/mL',
        adverseEvents: ['Respiratory Depression', 'Hypotension', 'Paradoxical Agitation'],
        calculation: () => ({ dose: 1, unit: 'mg', notes: 'Start with 0.5-1mg in elderly.' })
    },
    {
        name: 'Morphine',
        doseText: '0.1 mg/kg or titration (e.g. 2mg every 5 min)',
        concentration: '10 mg/mL (usually diluted to 1mg/mL)',
        adverseEvents: ['Respiratory Depression', 'Pruritus/Histamine Release', 'Nausea and Vomiting'],
        calculation: (weight) => ({ dose: 0.1 * weight, unit: 'mg', notes: 'Titrate IV to pain relief and respiratory rate.' })
    },
    {
        name: 'Naloxone',
        doseText: '0.4 - 2 mg IV/IM/SC',
        concentration: '0.4 mg/mL',
        notes: 'Titrate 40-100mcg increments if trying to preserve analgesia.',
        adverseEvents: ['Pulmonary Edema', 'Severe Tachycardia/Hypertension', 'Acute Opioid Withdrawal'],
        calculation: () => ({ dose: 0.4, unit: 'mg', volume: 1, volumeUnit: 'mL' })
    },
    {
        name: 'Neostigmine',
        doseText: '0.05 - 0.07 mg/kg IV',
        concentration: '2.5 mg/mL',
        maxDose: 'Max 5 mg',
        notes: 'Must give with anticholinergic (Atropine or Glycopyrrolate).',
        adverseEvents: ['Severe Bradycardia', 'Bronchospasm', 'Increased Secretions'],
        calculation: (weight) => ({ dose: Math.min(0.05 * weight, 5), unit: 'mg' })
    },
    {
        name: 'Norepinephrine',
        doseText: '0.05 - 1.0 mcg/kg/min',
        adverseEvents: ['Peripheral Ischemia/Necrosis', 'Myocardial Ischemia', 'Reflex Bradycardia'],
        infusionCalculation: (weight) => ({
            rate: '0.05-1.0 mcg/kg/min',
            preparation: '80 mcg/mL (4mg in 50mL D5W)',
            notes: `Calculated Rate: ${(0.05 * weight * 60 / 80).toFixed(1)} - ${(1.0 * weight * 60 / 80).toFixed(1)} mL/hr.`
        })
    },
    {
        name: 'Ondansetron',
        doseText: '4 - 8 mg IV/PO',
        concentration: '2 mg/mL',
        adverseEvents: ['QT Prolongation', 'Headache', 'Constipation'],
        calculation: () => ({ dose: 4, unit: 'mg', volume: 2, volumeUnit: 'mL' })
    },
    {
        name: 'Pancuronium',
        doseText: '0.1 mg/kg IV',
        concentration: '2 mg/mL',
        adverseEvents: ['Tachycardia', 'Hypertension', 'Prolonged Neuromuscular Block'],
        calculation: (weight) => ({ dose: 0.1 * weight, unit: 'mg', volume: (0.1 * weight) / 2, volumeUnit: 'mL' })
    },
    {
        name: 'Paracetamol',
        doseText: '1 g every 4-6 hours',
        concentration: '10 mg/mL (100mL bag IV)',
        maxDose: 'Max 4 g/day',
        adverseEvents: ['Hepatotoxicity', 'Hypersensitivity Reactions', 'Hypotension (Rapid IV infusion)'],
        calculation: () => ({ dose: 1000, unit: 'mg', volume: 100, volumeUnit: 'mL' })
    },
    {
        name: 'Phenylephrine',
        doseText: '50 - 100 mcg IV bolus',
        concentration: '100 mcg/mL (diluted)',
        adverseEvents: ['Severe Reflex Bradycardia', 'Pulmonary Edema', 'Hypertension'],
        calculation: () => ({ unit: 'mcg', notes: 'Standard bolus: 50-100mcg. Titrate to MAP.' })
    },
    {
        name: 'Propofol',
        doseText: '1.5 - 2.5 mg/kg for induction',
        concentration: '10 mg/mL (1%)',
        adverseEvents: ['Profound Hypotension', 'Apnea', 'Propofol Infusion Syndrome (long term)'],
        calculation: (weight) => {
            const dose = 2.0 * weight;
            return { dose, unit: 'mg', volume: dose / 10, volumeUnit: 'mL' };
        }
    },
    {
        name: 'Rocuronium',
        doseText: '0.6 - 1.2 mg/kg for intubation',
        concentration: '10 mg/mL',
        adverseEvents: ['Anaphylaxis', 'Prolonged Paralysis', 'Tachycardia'],
        calculation: (weight) => {
            const dose = 0.6 * weight;
            return { dose, unit: 'mg', volume: dose / 10, volumeUnit: 'mL' };
        }
    },
    {
        name: 'Sildenafil',
        doseText: '20 mg PO TDS',
        notes: 'Standard adult dose for PAH.',
        adverseEvents: ['Hypotension (especially with Nitrates)', 'Vision changes (blue tint)', 'Headache'],
        calculation: () => ({ dose: 20, unit: 'mg' })
    },
    {
        name: 'Sugammadex',
        doseText: '2 - 4 mg/kg depending on block depth',
        concentration: '100 mg/mL',
        adverseEvents: ['Anaphylaxis', 'Coagulopathy (Transient)', 'Bradycardia'],
        calculation: (weight) => {
            const dose = 2.0 * weight;
            return { dose, unit: 'mg', volume: dose / 100, volumeUnit: 'mL', notes: '2mg/kg for routine reversal (TOF count ≥2).' };
        }
    },
    {
        name: 'Suxamethonium',
        doseText: '1.0 - 1.5 mg/kg IV',
        concentration: '50 mg/mL',
        adverseEvents: ['Severe Hyperkalemia', 'Malignant Hyperthermia', 'Masseter Muscle Spasm'],
        calculation: (weight) => ({ dose: 1.0 * weight, unit: 'mg', volume: (1.0 * weight) / 50, volumeUnit: 'mL' })
    }
].sort((a, b) => a.name.localeCompare(b.name));

const paediatricDrugDatabase: Drug[] = [
    // A
    {
        name: 'Adenosine',
        doseText: 'Initial: 0.1 mg/kg; Subsequent: 0.2 mg/kg',
        concentration: '3 mg/mL',
        maxDose: 'Max initial 6mg, max subsequent 12mg',
        notes: 'For SVT. Administer as a rapid IV push followed by a saline flush.',
        adverseEvents: ['Transient asystole/bradycardia', 'Flushing', 'Bronchospasm'],
        calculation: (weight) => {
            const initialDose = Math.min(0.1 * weight, 6);
            const subsequentDose = Math.min(0.2 * weight, 12);
            const initialVolume = initialDose / 3;
            const subsequentVolume = subsequentDose / 3;
            return {
                dose: 0,
                unit: 'mg',
                notes: `Initial Dose (0.1mg/kg, max 6mg):\n${initialDose.toFixed(2)} mg (${initialVolume.toFixed(2)} mL)\n\nSubsequent Dose (0.2mg/kg, max 12mg):\n${subsequentDose.toFixed(2)} mg (${subsequentVolume.toFixed(2)} mL)`
            };
        }
    },
    {
        name: 'Adrenaline (Epinephrine) 1:10,000 (IV, Cardiac Arrest)',
        doseText: '10 mcg/kg (0.1 mL/kg)',
        concentration: '1 mg / 10 mL (100 mcg/mL)',
        adverseEvents: ['Tachyarrhythmias', 'Severe Hypertension', 'Myocardial Ischemia'],
        calculation: (weight) => {
            const doseMcg = 10 * weight;
            const volume = 0.1 * weight;
            return { dose: parseFloat(doseMcg.toFixed(2)), unit: 'mcg', volume: parseFloat(volume.toFixed(2)), volumeUnit: 'mL' };
        }
    },
    {
        name: 'Adrenaline (Epinephrine) 1:1000 (IM, Anaphylaxis)',
        doseText: '10 mcg/kg (0.01 mL/kg)',
        concentration: '1 mg / 1 mL (1000 mcg/mL)',
        maxDose: 'Max 0.5 mg (500 mcg)',
        adverseEvents: ['Tachycardia', 'Palpitations', 'Hypertension'],
        calculation: (weight) => {
            const doseMcg = Math.min(10 * weight, 500);
            const volume = 0.01 * weight;
            return { dose: parseFloat(doseMcg.toFixed(2)), unit: 'mcg', volume: Math.min(parseFloat(volume.toFixed(2)), 0.5), volumeUnit: 'mL' };
        }
    },
    {
        name: 'Amiodarone (Cardiac Arrest - VF/pVT)',
        doseText: '5 mg/kg bolus',
        concentration: '50 mg/mL',
        maxDose: 'Max single dose 300mg',
        notes: 'For shock-refractory VF/pulseless VT. Can be repeated up to 2 times.',
        adverseEvents: ['Severe Hypotension', 'Bradycardia', 'QT prolongation'],
        calculation: (weight) => {
            const dose = Math.min(5 * weight, 300);
            const volume = dose / 50;
            return {
                dose: parseFloat(dose.toFixed(2)),
                unit: 'mg',
                volume: parseFloat(volume.toFixed(2)),
                volumeUnit: 'mL'
            };
        }
    },
    {
        name: 'Amiodarone (Perfusing Tachycardia)',
        doseText: 'Loading dose: 5 mg/kg over 20-60 min',
        concentration: '50 mg/mL',
        maxDose: 'Max single dose 300mg',
        notes: 'For stable wide-complex tachycardia. Followed by an infusion.',
        adverseEvents: ['Severe Hypotension', 'Bradycardia', 'Phlebitis (peripheral)'],
        calculation: (weight) => {
            const dose = Math.min(5 * weight, 300);
            return {
                dose: parseFloat(dose.toFixed(2)),
                unit: 'mg',
                notes: 'Dilute and infuse over 20-60 minutes. Slower infusion reduces risk of hypotension.'
            };
        },
        infusionCalculation: (weight) => {
            const preparationConcentration = 1500; // mcg/mL
            const rateLower = (5 * weight * 60) / preparationConcentration;
            const rateUpper = (15 * weight * 60) / preparationConcentration;
            return {
                rate: '5-15 mcg/kg/min',
                preparation: 'Add 150mg (3mL) to 97mL D5W to make 1.5 mg/mL (1500 mcg/mL).',
                notes: `Calculated Infusion Rate: ${rateLower.toFixed(1)} - ${rateUpper.toFixed(1)} mL/hr.`
            };
        }
    },
    {
        name: 'Atracurium',
        doseText: 'Intubation: 0.5 mg/kg; Infusion: 5-10 mcg/kg/min',
        concentration: '10 mg/mL',
        adverseEvents: ['Histamine release (Hypotension)', 'Bronchospasm', 'Seizures (Laudanosine build-up)'],
        calculation: (weight) => {
            const dose = 0.5 * weight;
            const volume = dose / 10;
            return {
                dose: parseFloat(dose.toFixed(2)),
                unit: 'mg',
                volume: parseFloat(volume.toFixed(2)),
                volumeUnit: 'mL',
                notes: 'Standard intubating dose.'
            };
        },
        infusionCalculation: (weight) => {
            const preparationConcentration = 500; // mcg/mL
            const rateLower = (5 * weight * 60) / preparationConcentration;
            const rateUpper = (10 * weight * 60) / preparationConcentration;
            return {
                rate: '5-10 mcg/kg/min',
                preparation: 'Dilute 50mg (5mL) into 95mL NS to make 0.5 mg/mL (500 mcg/mL).',
                notes: `Calculated Infusion Rate: ${rateLower.toFixed(1)} - ${rateUpper.toFixed(1)} mL/hr.`
            };
        }
    },
    {
        name: 'Atropine',
        doseText: '0.02 mg/kg',
        concentration: '0.6 mg/mL',
        notes: 'Minimum dose 0.1mg. Maximum single dose 0.5mg (child) or 1mg (adolescent).',
        adverseEvents: ['Paradoxical Bradycardia (if dose too low)', 'Hyperthermia', 'Central Anticholinergic Syndrome'],
        calculation: (weight) => {
            let dose = 0.02 * weight;
            if (dose < 0.1) dose = 0.1;
            if (weight > 25) { // Simple check for adolescent
                 dose = Math.min(dose, 1.0);
            } else {
                 dose = Math.min(dose, 0.5);
            }
            const volume = dose / 0.6;
            return { dose: parseFloat(dose.toFixed(2)), unit: 'mg', volume: parseFloat(volume.toFixed(2)), volumeUnit: 'mL' };
        }
    },
    // B
    {
        name: 'Bupivacaine 0.5% Heavy (Spinal)',
        doseText: '0.3-0.5 mg/kg',
        concentration: '5 mg/mL in 8% Dextrose',
        notes: 'Hyperbaric solution for spinal anaesthesia. Dose depends on patient height, desired block level, and surgical procedure.',
        adverseEvents: ['Hypotension', 'Bradycardia', 'Total Spinal (Apnea)'],
        calculation: (weight) => {
            const doseLower = 0.3 * weight;
            const doseUpper = 0.5 * weight;
            const volumeLower = doseLower / 5;
            const volumeUpper = doseUpper / 5;
             return {
                dose: 0,
                unit: 'mg',
                notes: `Dose Range: ${doseLower.toFixed(1)}-${doseUpper.toFixed(1)} mg\nVolume Range: ${volumeLower.toFixed(2)}-${volumeUpper.toFixed(2)} mL`
            };
        }
    },
    {
        name: 'Bupivacaine 0.5% Plain (Regional Bolus)',
        doseText: 'Bolus: 0.3-0.5 mg/kg; Infusion: 0.1-0.4 mg/kg/hr',
        concentration: '5 mg/mL',
        notes: 'Spinal/Epidural dose is complex. This is a guideline for educational purposes.',
        adverseEvents: ['LAST (Cardiac Arrest)', 'Hypotension', 'Bradycardia'],
        calculation: (weight) => {
            const doseLower = 0.3 * weight;
            const doseUpper = 0.5 * weight;
            const volumeLower = doseLower / 5;
            const volumeUpper = doseUpper / 5;
             return {
                dose: 0,
                unit: 'mg',
                notes: `Dose Range: ${doseLower.toFixed(1)}-${doseUpper.toFixed(1)} mg\nVolume Range: ${volumeLower.toFixed(2)}-${volumeUpper.toFixed(2)} mL`
            };
        },
        infusionCalculation: (weight) => {
            const rateLower = (0.1 * weight);
            const rateUpper = (0.4 * weight);
             return {
                rate: '0.1-0.4 mg/kg/hr',
                preparation: 'Typically diluted to 0.1% or 0.25% for infusions.\nExample (0.1%): Add 10mL of 0.5% Bupivacaine to 40mL NS.',
                notes: `Calculated dose rate: ${rateLower.toFixed(1)} - ${rateUpper.toFixed(1)} mg/hr.\nAdjust volume based on prepared concentration.`
            };
        }
    },
    // C
    {
        name: 'Caffeine Citrate (Loading Dose)',
        doseText: '20 mg/kg',
        concentration: '20 mg/mL',
        notes: 'Standard dose for neonatal apnea.',
        adverseEvents: ['Tachycardia', 'Feeding intolerance', 'Jitteriness'],
        calculation: (weight) => {
            const dose = 20 * weight;
            const volume = dose / 20;
            return { dose: parseFloat(dose.toFixed(2)), unit: 'mg', volume: parseFloat(volume.toFixed(2)), volumeUnit: 'mL' };
        }
    },
    // D
    {
        name: 'Dantrolene',
        doseText: 'Initial bolus: 2.5 mg/kg',
        concentration: 'Reconstituted to 0.33 mg/mL',
        notes: 'For Malignant Hyperthermia. Each 20mg vial must be reconstituted with 60mL of sterile water for injection without a bacteriostatic agent.',
        adverseEvents: ['Profound Muscle Weakness', 'Respiratory Arrest', 'Phlebitis'],
        calculation: (weight) => {
            const dose = 2.5 * weight;
            const volume = dose / (20 / 60); // 20mg in 60mL = 0.333... mg/mL
            return {
                dose: parseFloat(dose.toFixed(2)),
                unit: 'mg',
                volume: parseFloat(volume.toFixed(2)),
                volumeUnit: 'mL',
                notes: 'Repeat bolus as needed until symptoms subside. Continue infusion at 1 mg/kg/hr for at least 24 hours.'
            };
        }
    },
    {
        name: 'Dexamethasone',
        doseText: '0.15 mg/kg',
        concentration: '4 mg/mL',
        maxDose: 'Max 8mg',
        adverseEvents: ['Hyperglycemia', 'Gastrointestinal bleeding', 'Insomnia'],
        calculation: (weight) => {
            const dose = Math.min(0.15 * weight, 8);
            const volume = dose / 4;
            return { dose: parseFloat(dose.toFixed(2)), unit: 'mg', volume: parseFloat(volume.toFixed(2)), volumeUnit: 'mL' };
        }
    },
    {
        name: 'Dexmedetomidine',
        doseText: 'Loading: 1 mcg/kg over 10 min; Infusion: 0.2-0.7 mcg/kg/hr',
        concentration: '100 mcg/mL vial (dilute before use)',
        adverseEvents: ['Bradycardia', 'Hypotension', 'Hypertension (bolus phase)'],
        calculation: (weight) => { // Loading dose
            const dose = 1 * weight;
            return {
                dose: parseFloat(dose.toFixed(2)),
                unit: 'mcg',
                notes: 'To be infused over 10 minutes.'
            };
        },
        infusionCalculation: (weight) => {
            return {
                rate: '0.2-0.7 mcg/kg/hr',
                preparation: 'Dilute 2mL (200mcg) in 48mL of Normal Saline to make 4 mcg/mL.',
                notes: 'Titrate infusion to desired level of sedation (e.g., RASS score).'
            };
        }
    },
    {
        name: 'Dextrose 10% (Hypoglycemia)',
        doseText: '2 mL/kg',
        notes: 'Can also be given as 0.2 g/kg.',
        adverseEvents: ['Hyperglycemia', 'Fluid Overload', 'Hypokalemia'],
        calculation: (weight) => {
            const volume = 2 * weight;
            return { dose: 0.2 * weight, unit: 'g', volume: parseFloat(volume.toFixed(2)), volumeUnit: 'mL' };
        }
    },
    {
        name: 'Diclofenac',
        doseText: '1 mg/kg',
        concentration: '75 mg / 2 mL',
        maxDose: 'Max 75mg',
        adverseEvents: ['Acute Kidney Injury', 'Gastric Ulceration', 'Platelet Dysfunction'],
        calculation: (weight) => {
            const dose = Math.min(1 * weight, 75);
            const volume = (dose / 75) * 2;
            return { dose: parseFloat(dose.toFixed(2)), unit: 'mg', volume: parseFloat(volume.toFixed(2)), volumeUnit: 'mL' };
        }
    },
    // E
    {
        name: 'Ephedrine (IV Bolus)',
        doseText: '0.1-0.2 mg/kg',
        concentration: '3 mg/mL',
        notes: 'Typically for treating hypotension under anaesthesia.',
        adverseEvents: ['Tachycardia', 'Arrhythmias', 'Hypertension'],
        calculation: (weight) => {
            const doseLower = 0.1 * weight;
            const doseUpper = 0.2 * weight;
            const volumeLower = doseLower / 3;
            const volumeUpper = doseUpper / 3;
            return {
                dose: 0, unit: 'mg',
                notes: `Dose Range: ${doseLower.toFixed(1)}-${doseUpper.toFixed(1)} mg\nVolume Range: ${volumeLower.toFixed(2)}-${volumeUpper.toFixed(2)} mL`
            };
        }
    },
    {
        name: 'Esmolol',
        doseText: 'Load: 500 mcg/kg over 1 min; Infusion: 50-300 mcg/kg/min',
        concentration: '10 mg/mL (10,000 mcg/mL)',
        adverseEvents: ['Hypotension', 'Bradycardia', 'Bronchospasm'],
        calculation: (weight) => { // Loading dose
            const dose = 500 * weight;
            const volume = dose / 10000;
            return {
                dose: parseFloat(dose.toFixed(0)),
                unit: 'mcg',
                volume: parseFloat(volume.toFixed(2)),
                volumeUnit: 'mL',
                notes: 'Infuse over 1 minute.'
            };
        },
        infusionCalculation: (weight) => {
            const preparationConcentration = 10000; // mcg/mL
            const rateLower = (50 * weight * 60) / preparationConcentration;
            const rateUpper = (300 * weight * 60) / preparationConcentration;
            return {
                rate: '50-300 mcg/kg/min',
                preparation: 'Use undiluted from vial (10 mg/mL).',
                notes: `Calculated Infusion Rate: ${rateLower.toFixed(1)} - ${rateUpper.toFixed(1)} mL/hr.`
            };
        }
    },
    // F
    {
        name: 'Fentanyl',
        doseText: 'Bolus: 1-2 mcg/kg; Infusion: 1-5 mcg/kg/hr',
        concentration: '50 mcg/mL',
        adverseEvents: ['Respiratory Depression', 'Chest Wall Rigidity', 'Bradycardia'],
        calculation: (weight) => {
            const doseLower = 1 * weight;
            const doseUpper = 2 * weight;
            const volumeLower = doseLower / 50;
            const volumeUpper = doseUpper / 50;
            return {
                dose: 0, unit: 'mcg',
                notes: `Dose Range: ${doseLower.toFixed(1)}-${doseUpper.toFixed(1)} mcg\nVolume Range: ${volumeLower.toFixed(2)}-${volumeUpper.toFixed(2)} mL`
            };
        },
        infusionCalculation: (weight) => {
            const rateLowerMlHr = (1 * weight) / 10;
            const rateUpperMlHr = (5 * weight) / 10;
            return {
                rate: '1-5 mcg/kg/hr',
                preparation: 'Dilute 10mL (500mcg) in 40mL Normal Saline to make 10 mcg/mL.',
                notes: `Calculated Rate: ${rateLowerMlHr.toFixed(1)} - ${rateUpperMlHr.toFixed(1)} mL/hr.\nTitrate to achieve desired analgesia/sedation.`
            };
        }
    },
    // I
    {
        name: 'Ibuprofen',
        doseText: '10 mg/kg',
        concentration: '100 mg / 5 mL',
        maxDose: 'Max 600mg per dose',
        adverseEvents: ['Gastric Ulceration', 'Renal Impairment', 'Platelet Inhibition'],
        calculation: (weight) => {
            const dose = Math.min(10 * weight, 600);
            const volume = (dose / 100) * 5;
            return { dose: parseFloat(dose.toFixed(2)), unit: 'mg', volume: parseFloat(volume.toFixed(2)), volumeUnit: 'mL' };
        }
    },
    {
        name: 'Intralipid 20% (LAST Rescue)',
        doseText: 'Bolus: 1.5 mL/kg; Infusion: 0.25 mL/kg/min',
        concentration: '20% Lipid Emulsion',
        notes: 'For treatment of Local Anesthetic Systemic Toxicity (LAST). Follow established protocols (e.g., AAGBI, ASRA).',
        adverseEvents: ['Hypertriglyceridemia', 'Fat Overload Syndrome', 'Interference with blood gas analysis'],
        calculation: (weight) => { // Bolus calculation
            const volume = 1.5 * weight;
            return {
                dose: 0, // Dose is described by volume
                unit: 'mL',
                volume: parseFloat(volume.toFixed(2)),
                volumeUnit: 'mL',
                notes: 'Administer over 1 minute. Can be repeated once or twice if cardiovascular stability is not restored.'
            };
        },
        infusionCalculation: (weight) => {
            const rateMlMin = 0.25 * weight;
            const rateMlHr = rateMlMin * 60;
            return {
                rate: '0.25 mL/kg/min (15 mL/kg/hr)',
                preparation: 'Use undiluted from bag/bottle.',
                notes: `Calculated Infusion Rate: ${rateMlHr.toFixed(1)} mL/hr. Consider doubling the rate to 0.5 mL/kg/min if cardiovascular stability is not restored.`
            };
        }
    },
    // K
    {
        name: 'Ketamine (Analgesia)',
        doseText: 'Bolus: 0.1-0.3 mg/kg; Infusion: 0.1-0.5 mg/kg/hr',
        concentration: '10 mg/mL (Dilute for infusion)',
        notes: 'Sub-anaesthetic dose for analgesia.',
        adverseEvents: ['Psychomimetic effects (hallucinations)', 'Salivary Hypersecretion', 'Laryngospasm'],
        calculation: (weight) => {
            const doseLower = 0.1 * weight;
            const doseUpper = 0.3 * weight;
            const volumeLower = doseLower / 10;
            const volumeUpper = doseUpper / 10;
            return {
                dose: 0, unit: 'mg',
                notes: `Dose Range: ${doseLower.toFixed(1)}-${doseUpper.toFixed(1)} mg\nVolume Range: ${volumeLower.toFixed(2)}-${volumeUpper.toFixed(2)} mL`
            };
        },
        infusionCalculation: (weight) => {
             return {
                rate: '0.1-0.5 mg/kg/hr',
                preparation: 'Dilute 100mg (2mL of 50mg/mL vial) into 98mL Normal Saline to make 1 mg/mL.',
                notes: 'Typically used as an adjunct for severe pain. Monitor for psychomimetic side effects.'
            };
        }
    },
    {
        name: 'Ketamine (IV Induction)',
        doseText: 'Bolus: 1-2 mg/kg; Infusion: 0.5-2 mg/kg/hr',
        concentration: '10 mg/mL',
        adverseEvents: ['Laryngospasm', 'Hypertension/Tachycardia', 'Nystagmus'],
        calculation: (weight) => {
            const doseLower = 1 * weight;
            const doseUpper = 2 * weight;
            const volumeLower = doseLower / 10;
            const volumeUpper = doseUpper / 10;
            return {
                dose: 0, unit: 'mg',
                notes: `Dose Range: ${doseLower.toFixed(1)}-${doseUpper.toFixed(1)} mg\nVolume Range: ${volumeLower.toFixed(1)}-${volumeUpper.toFixed(1)} mL`
            };
        },
        infusionCalculation: (weight) => {
             return {
                rate: '0.5-2 mg/kg/hr (sedation)',
                preparation: 'Use undiluted at 10mg/mL or dilute 500mg (10mL of 50mg/mL vial) into 40mL NS to make 10 mg/mL.',
                notes: 'Lower doses for analgesia. Higher doses for sedation. Monitor for emergence reactions.'
            };
        }
    },
    // M
    {
        name: 'Magnesium Sulphate',
        doseText: '25-50 mg/kg over 20-30 min',
        concentration: '500 mg/mL vial (must be diluted)',
        maxDose: 'Max 2g',
        notes: 'Used for severe asthma, eclampsia, and as an adjunct for analgesia.',
        adverseEvents: ['Hypotension', 'Loss of Deep Tendon Reflexes', 'Respiratory Muscle Paralysis'],
        calculation: (weight) => {
            const doseLower = Math.min(25 * weight, 2000);
            const doseUpper = Math.min(50 * weight, 2000);
            return {
                dose: 0, unit: 'mg',
                notes: `Dose Range: ${doseLower.toFixed(0)}-${doseUpper.toFixed(0)} mg.\n\nTo Administer: Dilute the calculated dose in 50-100mL of Normal Saline and infuse over 20-30 minutes. This dose is typical for severe asthma. Analgesic doses are similar (e.g., 30-50 mg/kg) and may be followed by an infusion.\nExample prep: Add 2g (4mL of 50% solution) to 96mL NS to make 20mg/mL.`
            };
        }
    },
    {
        name: 'Midazolam',
        doseText: 'Procedural Sedation: 0.05-0.1 mg/kg; ICU Infusion: 0.02-0.1 mg/kg/hr',
        concentration: '1 mg/mL',
        adverseEvents: ['Apnea/Respiratory Depression', 'Hypotension', 'Paradoxical Reaction (Agitation)'],
        calculation: (weight) => { // Procedural Sedation Bolus
            const doseLower = 0.05 * weight;
            const doseUpper = 0.1 * weight;
            // Volume is same as dose for 1mg/mL concentration
            return {
                dose: 0,
                unit: 'mg',
                notes: `Dose Range: ${doseLower.toFixed(2)}-${doseUpper.toFixed(2)} mg\nVolume Range: ${doseLower.toFixed(2)}-${doseUpper.toFixed(2)} mL\n\nTitrate slowly to effect. Reduce dose in elderly or frail patients.`
            };
        },
        infusionCalculation: (weight) => { // ICU Sedation Infusion
            const rateLowerMgHr = 0.02 * weight;
            const rateUpperMgHr = 0.1 * weight;
            return {
                rate: '0.02-0.1 mg/kg/hr',
                preparation: 'Typically prepared as 1 mg/mL (e.g., 50mg in 50mL Normal Saline).',
                notes: `Calculated Rate: ${rateLowerMgHr.toFixed(2)} - ${rateUpperMgHr.toFixed(2)} mg/hr.\nTitrate to target sedation score (e.g., RASS). Accumulates in adipose tissue and with renal impairment.`
            };
        }
    },
    {
        name: 'Morphine',
        doseText: 'Bolus: 0.1 mg/kg; Infusion: 10-30 mcg/kg/hr',
        concentration: '10 mg/mL (Dilute for infusion)',
        maxDose: 'Max 10mg per bolus dose',
        adverseEvents: ['Respiratory Depression', 'Nausea and Vomiting', 'Pruritus'],
        calculation: (weight) => {
            const dose = Math.min(0.1 * weight, 10);
            const volume = dose / 10;
            return { dose: parseFloat(dose.toFixed(2)), unit: 'mg', volume: parseFloat(volume.toFixed(2)), volumeUnit: 'mL' };
        },
        infusionCalculation: (weight) => {
            const rateLowerMlHr = (10 * weight) / 1000;
            const rateUpperMlHr = (30 * weight) / 1000;
            return {
                rate: '10-30 mcg/kg/hr',
                preparation: 'Add 50mg Morphine to 50mL Normal Saline to make 1 mg/mL (1000 mcg/mL).',
                notes: `Calculated Rate: ${rateLowerMlHr.toFixed(2)} - ${rateUpperMlHr.toFixed(2)} mL/hr.\nMonitor for respiratory depression.`
            };
        }
    },
    // N
    {
        name: 'Naloxone (Opioid Reversal)',
        doseText: '0.1 mg/kg',
        concentration: '0.4 mg/mL',
        maxDose: 'Max 2mg per dose',
        notes: 'For severe opioid overdose. For reversal of respiratory depression while preserving analgesia, use much smaller titrated doses (e.g., 1-2 mcg/kg).',
        adverseEvents: ['Pulmonary Edema', 'Seizures', 'Severe Hypertension'],
        calculation: (weight) => {
            const dose = Math.min(0.1 * weight, 2);
            const volume = dose / 0.4;
            return {
                dose: parseFloat(dose.toFixed(2)),
                unit: 'mg',
                volume: parseFloat(volume.toFixed(2)),
                volumeUnit: 'mL'
            };
        }
    },
    {
        name: 'Neostigmine',
        doseText: '0.05 mg/kg',
        concentration: '2.5 mg/mL',
        maxDose: 'Max 5mg',
        notes: 'Reversal agent. MUST be given with an anticholinergic (e.g., Atropine 0.02 mg/kg or Glycopyrrolate 0.01 mg/kg).',
        adverseEvents: ['Profound Bradycardia', 'Increased Bronchial Secretions', 'Cholinergic Crisis'],
        calculation: (weight) => {
            const dose = Math.min(0.05 * weight, 5);
            const volume = dose / 2.5;
            return { dose: parseFloat(dose.toFixed(2)), unit: 'mg', volume: parseFloat(volume.toFixed(2)), volumeUnit: 'mL' };
        }
    },
    {
        name: 'Norepinephrine (Infusion)',
        doseText: '0.05-1 mcg/kg/min',
        adverseEvents: ['Peripheral Ischemia', 'Reflex Bradycardia', 'Necrosis if extravasated'],
        infusionCalculation: (weight) => {
             return {
                rate: '0.05 - 1 mcg/kg/min',
                preparation: 'Add 4mg (1 ampoule) to 46mL of Dextrose 5% to make 80 mcg/mL.',
                notes: 'Titrate to target Mean Arterial Pressure (MAP). Use a central line if possible.'
            };
        }
    },
    // O
    {
        name: 'Ondansetron',
        doseText: '0.1 mg/kg',
        concentration: '2 mg/mL',
        maxDose: 'Max 4mg',
        adverseEvents: ['QT Prolongation', 'Headache', 'Constipation'],
        calculation: (weight) => {
            const dose = Math.min(0.1 * weight, 4);
            const volume = dose / 2;
            return { dose: parseFloat(dose.toFixed(2)), unit: 'mg', volume: parseFloat(volume.toFixed(2)), volumeUnit: 'mL' };
        }
    },
    // P
    {
        name: 'Pancuronium',
        doseText: '0.1 mg/kg',
        concentration: '2 mg/mL',
        notes: 'Long-acting non-depolarizing muscle relaxant.',
        adverseEvents: ['Tachycardia', 'Prolonged Paralysis', 'Hypertension'],
        calculation: (weight) => {
            const dose = 0.1 * weight;
            const volume = dose / 2;
            return { dose: parseFloat(dose.toFixed(2)), unit: 'mg', volume: parseFloat(volume.toFixed(2)), volumeUnit: 'mL' };
        }
    },
    {
        name: 'Paracetamol (Acetaminophen)',
        doseText: '15 mg/kg',
        concentration: '120 mg / 5 mL',
        maxDose: 'Max 1g per dose',
        adverseEvents: ['Hepatotoxicity (overdose)', 'Severe Hypersensitivity', 'Drug-induced fever'],
        calculation: (weight) => {
            const dose = Math.min(15 * weight, 1000);
            const volume = (dose / 120) * 5;
            return { dose: parseFloat(dose.toFixed(2)), unit: 'mg', volume: parseFloat(volume.toFixed(2)), volumeUnit: 'mL' };
        }
    },
    {
        name: 'Propofol',
        doseText: 'Induction: 2-3 mg/kg; Infusion: 50-200 mcg/kg/min',
        concentration: '10 mg/mL',
        adverseEvents: ['Profound Hypotension', 'Apnea', 'Propofol Infusion Syndrome (PRIS)'],
        calculation: (weight) => {
            const doseLower = 2 * weight;
            const doseUpper = 3 * weight;
            const volumeLower = doseLower / 10;
            const volumeUpper = doseUpper / 10;
            return {
                dose: 0,
                unit: 'mg',
                notes: `Induction Dose: ${doseLower.toFixed(1)}-${doseUpper.toFixed(1)} mg\nVolume: ${volumeLower.toFixed(1)}-${volumeUpper.toFixed(1)} mL`
            };
        },
        infusionCalculation: (weight) => {
            const concentrationMcgMl = 10 * 1000; // 10mg/mL = 10,000 mcg/mL
            const rateLower = (50 * weight * 60) / concentrationMcgMl;
            const rateUpper = (200 * weight * 60) / concentrationMcgMl;
            return {
                rate: '50-200 mcg/kg/min',
                preparation: 'Use undiluted from vial (10 mg/mL).',
                notes: `Calculated Infusion Rate: ${rateLower.toFixed(1)} - ${rateUpper.toFixed(1)} mL/hr.\nTitrate to depth of anaesthesia/sedation.`
            };
        }
    },
    // R
    // REGIONAL BLOCKS START
    {
        name: 'Regional: ESP (Erector Spinae Plane) Block',
        doseText: '2 mg/kg (0.4 mL/kg of 0.5% Bupivacaine)',
        notes: 'Interfascial plane block. Local anesthetic spreads to paravertebral space.',
        coverage: 'Both (Somatosensory and Visceral, depending on dermatomal level)',
        adverseEvents: ['LAST (Systemic Toxicity)', 'Pneumothorax', 'Total Spinal (if needle too deep)'],
        calculation: (weight) => {
            const dose = 2 * weight; // 2mg/kg
            const volume = 0.4 * weight; // 2mg / (5mg/mL) = 0.4mL
            return { dose: parseFloat(dose.toFixed(1)), unit: 'mg', volume: parseFloat(volume.toFixed(1)), volumeUnit: 'mL', notes: 'Calculated using 0.5% Bupivacaine (5mg/mL).' };
        }
    },
    {
        name: 'Regional: Femoral Nerve Block',
        doseText: '2 mg/kg (0.4 mL/kg of 0.5% Bupivacaine)',
        notes: 'Targeting femoral nerve in the femoral crease/inguinal region.',
        coverage: 'Somatosensory (Anterior thigh, medial lower leg, and knee joint)',
        adverseEvents: ['LAST (Systemic Toxicity)', 'Intravascular Injection', 'Nerve Injury'],
        calculation: (weight) => {
            const dose = 2 * weight;
            const volume = 0.4 * weight;
            return { dose: parseFloat(dose.toFixed(1)), unit: 'mg', volume: parseFloat(volume.toFixed(1)), volumeUnit: 'mL', notes: 'Calculated using 0.5% Bupivacaine (5mg/mL).' };
        }
    },
    {
        name: 'Regional: Interscalene Brachial Plexus Block',
        doseText: '2 mg/kg (0.2-0.3 mL/kg of 0.5% Bupivacaine)',
        notes: 'Targeting brachial plexus roots/trunks between scalene muscles. Phrenic nerve palsy is common.',
        coverage: 'Somatosensory (Shoulder, lateral 2/3 of clavicle, proximal humerus)',
        adverseEvents: ['Phrenic Nerve Palsy', 'Intra-arterial injection (Seizure)', 'Horner Syndrome'],
        calculation: (weight) => {
            const dose = 2 * weight;
            const volume = 0.3 * weight;
            return { dose: parseFloat(dose.toFixed(1)), unit: 'mg', volume: parseFloat(volume.toFixed(1)), volumeUnit: 'mL', notes: 'Calculated using 0.5% Bupivacaine (5mg/mL) at 0.3 mL/kg.' };
        }
    },
    {
        name: 'Regional: PECS I & II Blocks',
        doseText: '2 mg/kg (0.4 mL/kg of 0.5% Bupivacaine)',
        notes: 'Targeting pectoral, intercostobrachial, and long thoracic nerves.',
        coverage: 'Somatosensory (Breast tissue, pectoralis major/minor, hemithorax)',
        adverseEvents: ['Pneumothorax', 'LAST (Systemic Toxicity)', 'Vascular puncture'],
        calculation: (weight) => {
            const dose = 2 * weight;
            const volume = 0.4 * weight;
            return { dose: parseFloat(dose.toFixed(1)), unit: 'mg', volume: parseFloat(volume.toFixed(1)), volumeUnit: 'mL', notes: 'Calculated using 0.5% Bupivacaine (5mg/mL).' };
        }
    },
    {
        name: 'Regional: Popliteal Sciatic Block',
        doseText: '2 mg/kg (0.3-0.4 mL/kg of 0.5% Bupivacaine)',
        notes: 'Targeting sciatic nerve proximal to its division in the popliteal fossa.',
        coverage: 'Somatosensory (Foot, ankle, and lower leg excluding medial strip)',
        adverseEvents: ['Nerve Injury (Neuropraxia)', 'LAST (Systemic Toxicity)', 'Hematoma'],
        calculation: (weight) => {
            const dose = 2 * weight;
            const volume = 0.4 * weight;
            return { dose: parseFloat(dose.toFixed(1)), unit: 'mg', volume: parseFloat(volume.toFixed(1)), volumeUnit: 'mL', notes: 'Calculated using 0.5% Bupivacaine (5mg/mL).' };
        }
    },
    {
        name: 'Regional: Rectus Sheath Block',
        doseText: '2 mg/kg total (0.2 mL/kg per side of 0.5% Bupivacaine)',
        notes: 'Local anesthetic deposited between rectus abdominis muscle and posterior sheath.',
        coverage: 'Somatosensory (Midline anterior abdominal wall)',
        adverseEvents: ['Peritoneal perforation', 'LAST (Systemic Toxicity)', 'Superior epigastric artery injury'],
        calculation: (weight) => {
            const dose = 2 * weight;
            const volumePerSide = 0.2 * weight;
            return { dose: parseFloat(dose.toFixed(1)), unit: 'mg', volume: parseFloat((volumePerSide * 2).toFixed(1)), volumeUnit: 'mL', notes: `Total Volume: ${(volumePerSide * 2).toFixed(1)} mL (${volumePerSide.toFixed(1)} mL per side).\nCalculated using 0.5% Bupivacaine (5mg/mL).` };
        }
    },
    {
        name: 'Regional: TAP (Transversus Abdominis Plane) Block',
        doseText: '2 mg/kg (0.4 mL/kg of 0.5% Bupivacaine)',
        notes: 'Targeting T6-L1 nerves in the plane between internal oblique and transversus abdominis.',
        coverage: 'Somatosensory (Anterior abdominal wall skin and parietal peritoneum)',
        adverseEvents: ['Intra-peritoneal injection', 'LAST (Systemic Toxicity)', 'Liver/Spleen injury (rare)'],
        calculation: (weight) => {
            const dose = 2 * weight;
            const volume = 0.4 * weight;
            return { dose: parseFloat(dose.toFixed(1)), unit: 'mg', volume: parseFloat(volume.toFixed(1)), volumeUnit: 'mL', notes: 'Calculated using 0.5% Bupivacaine (5mg/mL).' };
        }
    },
    // REGIONAL BLOCKS END
    {
        name: 'Rocuronium',
        doseText: 'Intubation: 0.6-1.2 mg/kg; Infusion: 5-15 mcg/kg/min',
        concentration: '10 mg/mL',
        adverseEvents: ['Severe Anaphylaxis', 'Prolonged Paralysis', 'Tachycardia'],
        calculation: (weight) => {
            const standardDose = 0.6 * weight;
            const rsiDose = 1.2 * weight;
            const standardVolume = standardDose / 10;
            const rsiVolume = rsiDose / 10;
            return {
                dose: 0,
                unit: 'mg',
                notes: `Standard Intubation (0.6 mg/kg):\nDose: ${standardDose.toFixed(1)} mg, Volume: ${standardVolume.toFixed(2)} mL\n\nRSI (1.2 mg/kg):\nDose: ${rsiDose.toFixed(1)} mg, Volume: ${rsiVolume.toFixed(2)} mL`
            };
        },
        infusionCalculation: (weight) => {
            const preparationConcentration = 1000; // mcg/mL
            const rateLower = (5 * weight * 60) / preparationConcentration;
            const rateUpper = (15 * weight * 60) / preparationConcentration;
            return {
                rate: '5-15 mcg/kg/min',
                preparation: 'Dilute 50mg (5mL) into 45mL NS to make 1 mg/mL (1000 mcg/mL).',
                notes: `Calculated Infusion Rate: ${rateLower.toFixed(1)} - ${rateUpper.toFixed(1)} mL/hr.`
            };
        }
    },
    // S
    {
        name: 'Sildenafil (IV)',
        doseText: 'Load: 10 mcg/kg over 3 min; Infusion: 10 mcg/kg/hr',
        concentration: '0.8 mg/mL (800 mcg/mL)',
        notes: 'For treatment of pulmonary hypertension.',
        adverseEvents: ['Hypotension', 'Flushing', 'Visual color changes'],
        calculation: (weight) => { // Loading dose
            const dose = 10 * weight;
            const volume = dose / 800;
            return {
                dose: parseFloat(dose.toFixed(1)),
                unit: 'mcg',
                volume: parseFloat(volume.toFixed(2)),
                volumeUnit: 'mL',
                notes: 'To be infused over 3 minutes.'
            };
        },
        infusionCalculation: (weight) => {
            const doseHr = 10 * weight; // mcg/hr
            const rateMlHr = doseHr / 800; // (mcg/hr) / (mcg/mL)
            return {
                rate: '10 mcg/kg/hr',
                preparation: 'Use standard vial concentration (0.8 mg/mL).',
                notes: `Calculated Infusion Rate: ${rateMlHr.toFixed(2)} mL/hr.`
            };
        }
    },
    {
        name: 'Sugammadex',
        doseText: '2-16 mg/kg depending on block depth',
        concentration: '100 mg/mL',
        notes: 'Reversal agent for Rocuronium/Vecuronium.',
        adverseEvents: ['Severe Anaphylaxis', 'Marked Bradycardia', 'Transient Coagulopathy'],
        calculation: (weight) => {
            const moderateDose = 2 * weight;
            const deepDose = 4 * weight;
            const immediateDose = 16 * weight;
            return {
                dose: 0,
                unit: 'mg',
                notes: `Moderate Block (TOF count ≥2):\nDose: ${moderateDose.toFixed(0)} mg, Volume: ${(moderateDose/100).toFixed(2)} mL\n\nDeep Block (PTC 1-2):\nDose: ${deepDose.toFixed(0)} mg, Volume: ${(deepDose/100).toFixed(2)} mL\n\nImmediate Reversal (after 1.2mg/kg Roc):\nDose: ${immediateDose.toFixed(0)} mg, Volume: ${(immediateDose/100).toFixed(2)} mL`
            };
        }
    },
    {
        name: 'Suxamethonium',
        doseText: '1-2 mg/kg',
        concentration: '50 mg/mL',
        adverseEvents: ['Lethal Hyperkalemia', 'Malignant Hyperthermia', 'Profound Bradycardia'],
        calculation: (weight) => {
            const doseLower = 1 * weight;
            const doseUpper = 2 * weight;
            const volumeLower = doseLower / 50;
            const volumeUpper = doseUpper / 50;
            return {
                dose: 0,
                unit: 'mg',
                notes: `Dose: ${doseLower.toFixed(1)}-${doseUpper.toFixed(1)} mg\nVolume: ${volumeLower.toFixed(2)}-${volumeUpper.toFixed(2)} mL`
            };
        }
    }
].sort((a, b) => a.name.localeCompare(b.name));

const DoseCalculator: React.FC<{ 
    T: Record<string, any>, 
    language: string, 
    database: Drug[],
    title?: string 
}> = ({ T, language, database, title }) => {
    const [weight, setWeight] = useState<number | ''>('');
    const [selectedDrug, setSelectedDrug] = useState<Drug | null>(null);
    const [selectedInteractionDrugs, setSelectedInteractionDrugs] = useState<string[]>([]);
    const [interactionResult, setInteractionResult] = useState<string | null>(null);
    const [isCheckingInteractions, setIsCheckingInteractions] = useState<boolean>(false);
    const [interactionError, setInteractionError] = useState<string | null>(null);

    const bolusResult = useMemo(() => {
        if (selectedDrug && selectedDrug.calculation) {
            return selectedDrug.calculation(weight || 70); // Default to 70 for fixed dose visualization
        }
        return null;
    }, [weight, selectedDrug]);

    const infusionResult = useMemo(() => {
        if (weight && selectedDrug && selectedDrug.infusionCalculation) {
            return selectedDrug.infusionCalculation(weight);
        }
        return null;
    }, [weight, selectedDrug]);
    
    const handleDrugSelection = (drugName: string) => {
        setSelectedInteractionDrugs(prev => 
            prev.includes(drugName) 
                ? prev.filter(d => d !== drugName)
                : [...prev, drugName]
        );
    };

    const handleCheckInteractions = async () => {
        if (selectedInteractionDrugs.length < 2) return;
        setIsCheckingInteractions(true);
        setInteractionResult(null);
        setInteractionError(null);
        try {
            const result = await checkDrugInteractions(selectedInteractionDrugs, language);
            setInteractionResult(result);
        } catch (error) {
            console.error("Interaction check failed:", error);
            setInteractionError(T.interactionError);
        } finally {
            setIsCheckingInteractions(false);
        }
    };

    return (
        <div className="space-y-8">
            <div className="medical-card p-5 space-y-6">
                <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 bg-brand-blue/10 rounded-lg">
                        <span title={T.drugDoseCalculatorTitle}>
                            <Pill className="w-5 h-5 text-brand-blue" />
                        </span>
                    </div>
                    <div>
                        <h3 className="text-md font-bold text-slate-900 leading-tight">{T.drugDoseCalculatorTitle || 'Drug Dosage Calculator'}</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{T.drugDoseCalculatorSubtitle || 'Precision Dosing & Safety'}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label htmlFor="weight-input" className="block text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                            <span title={T.iconWeight}>
                                <Scale className="w-3 h-3" />
                            </span>
                            {T.weightKgLabel}
                        </label>
                        <input 
                            type="number" 
                            id="weight-input" 
                            value={weight} 
                            onChange={(e) => setWeight(e.target.value ? parseFloat(e.target.value) : '')} 
                            min="0" 
                            step="0.1" 
                            placeholder="e.g. 70"
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-all outline-none" 
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="drug-select" className="block text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                            <span title={T.iconSearch}>
                                <Search className="w-3 h-3" />
                            </span>
                            {T.selectDrugLabel}
                        </label>
                        <select 
                            id="drug-select" 
                            onChange={(e) => setSelectedDrug(database.find(d => d.name === e.target.value) || null)} 
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-all outline-none appearance-none"
                        >
                            <option value="">{T.selectDrugOption}</option>
                            {database.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                        </select>
                    </div>
                </div>

                {selectedDrug && (bolusResult || infusionResult) && (
                    <div className="mt-4 animate-fade-in space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                            <div>
                                <h3 className="text-xl font-black text-brand-blue tracking-tight">{selectedDrug.name}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="px-2 py-0.5 bg-slate-100 text-[10px] font-black text-slate-500 rounded uppercase tracking-widest">
                                        {selectedDrug.doseText}
                                    </span>
                                </div>
                            </div>
                            {selectedDrug.maxDose && (
                                <div className="px-3 py-1.5 bg-amber-50 rounded-xl border border-amber-100 flex items-center gap-1.5">
                                    <span title={T.iconWarning}>
                                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                                    </span>
                                    <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Max: {selectedDrug.maxDose}</p>
                                </div>
                            )}
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {bolusResult && (
                                <div className="p-5 bg-brand-blue/5 border border-brand-blue/10 rounded-2xl space-y-4 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <span title={T.iconBolus}>
                                            <Zap className="w-12 h-12 text-brand-blue" />
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-brand-blue/10 flex items-center justify-center">
                                            <span title={T.iconBolus}>
                                                <Zap className="w-3 h-3 text-brand-blue" />
                                            </span>
                                        </div>
                                        <h4 className="text-[10px] font-black text-brand-blue uppercase tracking-widest">{T.bolusDoseLabel}</h4>
                                    </div>
                                    <div className="flex flex-wrap items-baseline gap-4">
                                        {bolusResult.dose !== undefined && bolusResult.dose > 0 && (
                                            <div>
                                                <p className="text-3xl font-black text-slate-900 leading-none tracking-tight">
                                                    {bolusResult.dose.toFixed(1)} 
                                                    <span className="text-sm font-bold text-slate-400 ml-1">{bolusResult.unit}</span>
                                                </p>
                                            </div>
                                        )}
                                        {bolusResult.volume !== undefined && (
                                            <div className="pl-4 border-l border-brand-blue/10">
                                                <p className="text-3xl font-black text-slate-900 leading-none tracking-tight">
                                                    {bolusResult.volume.toFixed(2)} 
                                                    <span className="text-sm font-bold text-slate-400 ml-1">{bolusResult.volumeUnit}</span>
                                                </p>
                                                <p className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-widest">{selectedDrug.concentration}</p>
                                            </div>
                                        )}
                                    </div>
                                    {bolusResult.notes && (
                                        <div className="pt-3 border-t border-brand-blue/10">
                                            <p className="text-xs font-bold text-slate-600 flex items-start gap-2">
                                                <span title={T.iconInformation}>
                                                    <Info className="w-3.5 h-3.5 text-brand-blue shrink-0 mt-0.5" />
                                                </span>
                                                {bolusResult.notes}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {infusionResult && (
                                <div className="p-5 bg-indigo-50 border border-indigo-100 rounded-2xl space-y-4 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <span title={T.iconInfusion}>
                                            <Clock className="w-12 h-12 text-indigo-600" />
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center">
                                            <span title={T.iconInfusion}>
                                                <Clock className="w-3 h-3 text-indigo-600" />
                                            </span>
                                        </div>
                                        <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{T.infusionRateLabel}</h4>
                                    </div>
                                    <div>
                                        <p className="text-3xl font-black text-slate-900 leading-none tracking-tight">{infusionResult.rate}</p>
                                        <p className="text-[10px] font-black text-slate-400 mt-2 uppercase tracking-widest bg-white/50 inline-block px-2 py-0.5 rounded">{infusionResult.preparation}</p>
                                    </div>
                                    <div className="pt-3 border-t border-indigo-100">
                                        <p className="text-xs font-bold text-slate-600 flex items-start gap-2">
                                            <span title={T.iconInformation}>
                                                <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                                            </span>
                                            {infusionResult.notes}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {selectedDrug.adverseEvents && selectedDrug.adverseEvents.length > 0 && (
                            <div className="p-5 bg-red-50 border border-red-100 rounded-2xl">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
                                        <span title={T.iconAlert}>
                                            <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
                                        </span>
                                    </div>
                                    <h4 className="text-[10px] font-black text-red-600 uppercase tracking-widest">{T.safetyWatchAdverseEffectsLabel}</h4>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {selectedDrug.adverseEvents.slice(0, 4).map((effect, idx) => (
                                        <div key={idx} className="flex items-center gap-3 p-2 bg-white/40 rounded-xl border border-red-100/50 text-xs font-bold text-red-900/80">
                                            <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                                            {effect}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

            </div>

            <div className="medical-card p-5 space-y-6">
                <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 bg-indigo-100 rounded-lg">
                        <span title={T.iconLabelAlert}>
                            <ShieldAlert className="w-5 h-5 text-indigo-600" />
                        </span>
                    </div>
                    <div>
                        <h3 className="text-md font-bold text-slate-900 leading-tight">{T.drugInteractionCheckerTitle}</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{T.multiDrugSafetyAnalysisLabel}</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">{T.selectDrugsPrompt}</label>
                        <div className="max-h-48 overflow-y-auto pr-2 custom-scrollbar grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {database.map(drug => (
                                <label 
                                    key={drug.name} 
                                    className={`flex items-center p-2.5 rounded-xl border transition-all cursor-pointer ${
                                        selectedInteractionDrugs.includes(drug.name)
                                            ? 'bg-indigo-50 border-indigo-200 shadow-sm'
                                            : 'bg-white border-slate-100 hover:border-indigo-100'
                                    }`}
                                >
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                                        selectedInteractionDrugs.includes(drug.name)
                                            ? 'bg-indigo-600 border-indigo-600 text-white'
                                            : 'bg-slate-50 border-slate-200'
                                    }`}>
                                        {selectedInteractionDrugs.includes(drug.name) && (
                                            <span title={T.iconLabelSelected}>
                                                <CheckCircle2 className="w-3 h-3" />
                                            </span>
                                        )}
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={selectedInteractionDrugs.includes(drug.name)}
                                        onChange={() => handleDrugSelection(drug.name)}
                                        className="hidden"
                                    />
                                    <span className={`ml-2.5 text-xs font-bold ${
                                        selectedInteractionDrugs.includes(drug.name) ? 'text-indigo-900' : 'text-slate-600'
                                    }`}>{drug.name}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={handleCheckInteractions}
                        disabled={selectedInteractionDrugs.length < 2 || isCheckingInteractions}
                        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 px-4 rounded-xl transition-all shadow-md disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none uppercase tracking-widest text-xs"
                    >
                        {isCheckingInteractions ? (
                            <span title={T.iconLabelActivity}>
                                <Activity className="w-4 h-4 animate-pulse" />
                            </span>
                        ) : (
                            <span title={T.iconLabelSearch}>
                                <Search className="w-4 h-4" />
                            </span>
                        )}
                        {isCheckingInteractions ? T.checkingInteractionsMessage : T.checkInteractionsButton}
                    </button>

                    {(isCheckingInteractions || interactionResult || interactionError) && (
                        <div className="mt-4 p-5 bg-white border border-slate-200 rounded-2xl animate-fade-in shadow-sm">
                            <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
                                <span title={T.iconLabelResults}>
                                    <FileText className="w-4 h-4 text-indigo-600" />
                                </span>
                                <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{T.interactionResultsTitle}</h4>
                            </div>
                            
                            {isCheckingInteractions && (
                                <div className="flex flex-col items-center justify-center py-8 space-y-3">
                                    <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
                                    <p className="text-xs font-bold text-slate-500 animate-pulse">{T.checkingInteractionsMessage}</p>
                                </div>
                            )}
                            
                            {interactionError && (
                                <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2">
                                    <span title={T.iconLabelAlert}>
                                        <AlertCircle className="w-4 h-4 text-red-500" />
                                    </span>
                                    <p className="text-xs font-bold text-red-600">{interactionError}</p>
                                </div>
                            )}
                            
                            {interactionResult && (
                                <div className="text-sm text-slate-900 whitespace-pre-wrap leading-relaxed">
                                    <div 
                                        className="prose prose-sm max-w-none prose-headings:text-indigo-900 prose-headings:font-black prose-headings:uppercase prose-headings:tracking-widest prose-headings:text-[10px] prose-headings:mb-2 prose-p:text-slate-800 prose-p:font-medium prose-strong:text-slate-900 prose-strong:font-bold prose-ul:list-disc prose-ul:pl-4 prose-li:mb-1"
                                        dangerouslySetInnerHTML={{
                                            __html: interactionResult
                                                .replace(/### (.*)/g, '<h3 class="mt-4">$1</h3>')
                                                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                                .replace(/^- (.*)/gm, '<li>$1</li>')
                                                .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
                                        }} 
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};


// --- FLUID MANAGEMENT CALCULATOR ---

const FluidManagementCalculator: React.FC<{ T: Record<string, any> }> = ({ T }) => {
    const [weight, setWeight] = useState<number | ''>('');

    const { maintenance, bolus, breakdown } = useMemo(() => {
        if (!weight || weight <= 0) return { maintenance: null, bolus: null, breakdown: [] };
        
        // Holliday-Segar for maintenance
        let dailyFluid = 0;
        const breakdownSteps = [];
        if (weight <= 10) {
            dailyFluid = weight * 100;
            breakdownSteps.push(`First 10kg: ${weight.toFixed(1)}kg x 100 mL/kg = ${dailyFluid.toFixed(0)} mL`);
        } else if (weight <= 20) {
            const firstPart = 10 * 100;
            const secondPart = (weight - 10) * 50;
            dailyFluid = firstPart + secondPart;
            breakdownSteps.push(`First 10kg: 10kg x 100 mL/kg = ${firstPart} mL`);
            breakdownSteps.push(`Next 10kg: ${(weight - 10).toFixed(1)}kg x 50 mL/kg = ${secondPart.toFixed(0)} mL`);
        } else {
            const firstPart = 10 * 100;
            const secondPart = 10 * 50;
            const thirdPart = (weight - 20) * 20;
            dailyFluid = firstPart + secondPart + thirdPart;
            breakdownSteps.push(`First 10kg: 10kg x 100 mL/kg = ${firstPart} mL`);
            breakdownSteps.push(`Next 10kg: 10kg x 50 mL/kg = ${secondPart} mL`);
            breakdownSteps.push(`Remaining: ${(weight - 20).toFixed(1)}kg x 20 mL/kg = ${thirdPart.toFixed(0)} mL`);
        }

        const maintenanceResult = {
            daily: dailyFluid.toFixed(0),
            hourly: (dailyFluid / 24).toFixed(1),
        };
        
        // Bolus calculation
        const bolusResult = (weight * 20).toFixed(0);

        return { maintenance: maintenanceResult, bolus: bolusResult, breakdown: breakdownSteps };
    }, [weight]);

    return (
        <div className="space-y-8">
            <div className="medical-card p-5 space-y-6">
                <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 bg-brand-blue/10 rounded-lg">
                        <span title={T.iconLabelFluids}>
                            <Droplets className="w-5 h-5 text-brand-blue" />
                        </span>
                    </div>
                    <div>
                        <h3 className="text-md font-bold text-slate-900 leading-tight">{T.maintenanceFluidTitle}</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Holliday-Segar Method</p>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label htmlFor="fluid-weight-input" className="block text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                        <span title={T.iconLabelWeight}>
                            <Scale className="w-3 h-3" />
                        </span>
                        {T.weightKgLabel}
                    </label>
                    <input 
                        type="number" 
                        id="fluid-weight-input" 
                        value={weight} 
                        onChange={(e) => setWeight(e.target.value ? parseFloat(e.target.value) : '')} 
                        min="0" 
                        step="0.1" 
                        placeholder="e.g. 70"
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-all outline-none" 
                    />
                </div>

                {maintenance && (
                    <div className="mt-4 animate-fade-in space-y-6">
                        <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-2xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <span title={T.iconLabelFluids}>
                                    <Droplets className="w-16 h-16 text-emerald-600" />
                                </span>
                            </div>
                            <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                                    <span title={T.iconLabelActivity}>
                                        <Activity className="w-3 h-3 text-emerald-600" />
                                    </span>
                                </div>
                                {T.fluidResultsTitle}
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{T.dailyRequirementLabel}</p>
                                    <p className="text-3xl font-black text-slate-900 leading-none tracking-tight">
                                        {maintenance.daily} 
                                        <span className="text-sm font-bold text-slate-400 ml-1.5">{T.mlDay}</span>
                                    </p>
                                </div>
                                <div className="space-y-1 sm:pl-8 sm:border-l sm:border-emerald-100">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{T.hourlyRateLabel}</p>
                                    <p className="text-3xl font-black text-slate-900 leading-none tracking-tight">
                                        {maintenance.hourly} 
                                        <span className="text-sm font-bold text-slate-400 ml-1.5">{T.mlHr}</span>
                                    </p>
                                </div>
                            </div>
                            
                            <div className="mt-8 pt-6 border-t border-emerald-100 space-y-4">
                                <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest flex items-center gap-2">
                                    <span title={T.iconLabelChecklist}>
                                        <ClipboardList className="w-3.5 h-3.5" />
                                    </span>
                                    {T.fluidBreakdownTitle}
                                </p>
                                <div className="grid grid-cols-1 gap-2">
                                    {breakdown.map((step, i) => (
                                        <div key={i} className="text-xs font-bold text-slate-600 flex items-center gap-3 bg-white/40 p-2.5 rounded-xl border border-emerald-100/50">
                                            <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                                                <span className="text-[10px] font-black text-emerald-600">{i + 1}</span>
                                            </div>
                                            {step}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-amber-50 border border-amber-100 rounded-2xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <span title={T.iconLabelBolus}>
                                    <Zap className="w-16 h-16 text-amber-600" />
                                </span>
                            </div>
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center">
                                    <span title={T.iconLabelBolus}>
                                        <Zap className="w-3.5 h-3.5 text-amber-600" />
                                    </span>
                                </div>
                                <h4 className="text-[10px] font-black text-amber-600 uppercase tracking-widest">{T.bolusFluidTitle}</h4>
                            </div>
                            <div className="flex items-baseline gap-2">
                                <p className="text-3xl font-black text-slate-900 leading-none tracking-tight">{bolus}</p>
                                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">mL (20 mL/kg)</p>
                            </div>
                            <div className="mt-4 p-3 bg-white/40 rounded-xl border border-amber-100/50">
                                <p className="text-xs font-bold text-slate-600 flex items-start gap-2">
                                    <span title={T.iconLabelInformation}>
                                        <Info className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                                    </span>
                                    Standard bolus for initial resuscitation. Adjust based on clinical status and response.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

// --- SCORING SYSTEMS ---

const GcsCalculator: React.FC<{ T: Record<string, any> }> = ({ T }) => {
    const [scores, setScores] = useState({ eye: 4, verbal: 5, motor: 6 });

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const { name, value } = e.target;
        setScores(prev => ({ ...prev, [name]: parseInt(value) }));
    };

    const totalScore = scores.eye + scores.verbal + scores.motor;
    let interpretation = '';
    if (totalScore <= 8) interpretation = T.gcsSevere;
    else if (totalScore <= 12) interpretation = T.gcsModerate;
    else interpretation = T.gcsMild;

    const options = {
        eye: [
            { value: 4, text: T.gcsEye4 }, { value: 3, text: T.gcsEye3 },
            { value: 2, text: T.gcsEye2 }, { value: 1, text: T.gcsEye1 }
        ],
        verbal: [
            { value: 5, text: T.gcsVerbal5 }, { value: 4, text: T.gcsVerbal4 },
            { value: 3, text: T.gcsVerbal3 }, { value: 2, text: T.gcsVerbal2 },
            { value: 1, text: T.gcsVerbal1 }
        ],
        motor: [
            { value: 6, text: T.gcsMotor6 }, { value: 5, text: T.gcsMotor5 },
            { value: 4, text: T.gcsMotor4 }, { value: 3, text: T.gcsMotor3 },
            { value: 2, text: T.gcsMotor2 }, { value: 1, text: T.gcsMotor1 }
        ]
    };

    return (
        <div className="medical-card p-5 space-y-6">
            <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-brand-blue/10 rounded-lg">
                    <span title={T.iconLabelCalculator}>
                        <Calculator className="w-5 h-5 text-brand-blue" />
                    </span>
                </div>
                <div>
                    <h3 className="text-md font-bold text-slate-900 leading-tight">{T.gcsTitle}</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{T.gcsSubtitle}</p>
                </div>
            </div>

            <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                            <span title={T.iconLabelActivity}>
                                <Activity className="w-3 h-3" />
                            </span>
                            {T.gcsEyeResponse}
                        </label>
                        <select 
                            name="eye" 
                            value={scores.eye} 
                            onChange={handleChange} 
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-all outline-none appearance-none"
                        >
                            {options.eye.map(opt => <option key={opt.value} value={opt.value}>{opt.value} - {opt.text}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                            <span title={T.iconLabelActivity}>
                                <Activity className="w-3 h-3" />
                            </span>
                            {T.gcsVerbalResponse}
                        </label>
                        <select 
                            name="verbal" 
                            value={scores.verbal} 
                            onChange={handleChange} 
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-all outline-none appearance-none"
                        >
                            {options.verbal.map(opt => <option key={opt.value} value={opt.value}>{opt.value} - {opt.text}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                            <span title={T.iconLabelActivity}>
                                <Activity className="w-3 h-3" />
                            </span>
                            {T.gcsMotorResponse}
                        </label>
                        <select 
                            name="motor" 
                            value={scores.motor} 
                            onChange={handleChange} 
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-all outline-none appearance-none"
                        >
                            {options.motor.map(opt => <option key={opt.value} value={opt.value}>{opt.value} - {opt.text}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            <div className="mt-6 p-5 bg-brand-blue/5 border border-brand-blue/10 rounded-2xl flex items-center justify-between shadow-sm">
                <div>
                    <h4 className="text-[10px] font-black text-brand-blue uppercase tracking-widest mb-1">{T.gcsResultTitle}</h4>
                    <p className="text-3xl font-black text-slate-900 leading-none">{totalScore} <span className="text-sm font-bold text-slate-400">/ 15</span></p>
                    <p className="text-xs font-bold text-slate-600 mt-3 flex items-center gap-1.5">
                        <span title={T.iconLabelInformation}>
                            <Info className="w-3.5 h-3.5 text-brand-blue" />
                        </span>
                        {interpretation}
                    </p>
                </div>
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shadow-sm ${
                    totalScore <= 8 ? 'bg-red-100 text-red-600 border border-red-200' : 
                    totalScore <= 12 ? 'bg-amber-100 text-amber-600 border border-amber-200' : 
                    'bg-emerald-100 text-emerald-600 border border-emerald-200'
                }`}>
                    {totalScore}
                </div>
            </div>
        </div>
    );
};

const PonvCalculator: React.FC<{ T: Record<string, any> }> = ({ T }) => {
    const [riskFactors, setRiskFactors] = useState({ female: false, nonSmoker: false, history: false, opioids: false });

    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setRiskFactors(prev => ({ ...prev, [name]: checked }));
    };

    const score = Object.values(riskFactors).filter(Boolean).length;
    const riskPercentage = [10, 21, 39, 61, 79][score];

    const factors = [
        { key: 'female', text: T.ponvFemale },
        { key: 'nonSmoker', text: T.ponvNonSmoker },
        { key: 'history', text: T.ponvHistory },
        { key: 'opioids', text: T.ponvOpioids },
    ];

    return (
        <div className="medical-card p-5 space-y-6">
            <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-brand-blue/10 rounded-lg">
                    <span title={T.iconLabelActivity}>
                        <Activity className="w-5 h-5 text-brand-blue" />
                    </span>
                </div>
                <div>
                    <h3 className="text-md font-bold text-slate-900 leading-tight">{T.ponvTitle}</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{T.ponvSubtitle}</p>
                </div>
            </div>

            <div className="space-y-2">
                {factors.map(({ key, text }) => (
                    <label
                        key={key}
                        className={`flex items-center p-3.5 rounded-xl border transition-all cursor-pointer ${
                            riskFactors[key as keyof typeof riskFactors]
                                ? 'bg-brand-blue/5 border-brand-blue/30 shadow-sm'
                                : 'bg-slate-50 border-slate-100 hover:border-brand-blue/20'
                        }`}
                    >
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
                            riskFactors[key as keyof typeof riskFactors]
                                ? 'bg-brand-blue border-brand-blue text-white shadow-sm'
                                : 'bg-white border-slate-300'
                        }`}>
                            {riskFactors[key as keyof typeof riskFactors] && (
                                <span title={T.iconLabelSelected}>
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                </span>
                            )}
                        </div>
                        <input
                            type="checkbox"
                            name={key}
                            checked={riskFactors[key as keyof typeof riskFactors]}
                            onChange={handleCheckboxChange}
                            className="hidden"
                        />
                        <span className={`ml-3.5 text-sm font-bold ${
                            riskFactors[key as keyof typeof riskFactors] ? 'text-slate-900' : 'text-slate-600'
                        }`}>{text}</span>
                    </label>
                ))}
            </div>

            <div className="mt-6 p-5 bg-brand-blue/5 border border-brand-blue/10 rounded-2xl shadow-sm">
                <h4 className="text-[10px] font-black text-brand-blue uppercase tracking-widest mb-2">{T.ponvResultTitle}</h4>
                <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-black text-slate-900 leading-none">{score}</p>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{T.ponvRiskFactors(score)}</p>
                </div>
                <div className="mt-4 pt-4 border-t border-brand-blue/10">
                    <p className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <span title={T.iconLabelRiskLevel}>
                            <Zap className="w-4 h-4 text-amber-500" />
                        </span>
                        {T.ponvRiskPercentage(riskPercentage)}
                    </p>
                </div>
            </div>
        </div>
    );
};

const StopBangCalculator: React.FC<{ T: Record<string, any> }> = ({ T }) => {
    const [answers, setAnswers] = useState<Record<string, boolean>>({ snoring: false, tired: false, observed: false, pressure: false, bmi: false, age: false, neck: false, gender: false });
    
    const score = Object.values(answers).filter(Boolean).length;
    const { risk, recommendation } = useMemo(() => {
        const isHighRiskByCriteria = answers.bmi && answers.neck && answers.gender;
        if (score >= 5 || (score >= 2 && isHighRiskByCriteria)) {
            return { risk: T.stopBangHighRisk, recommendation: T.stopBangHighRiskRec };
        }
        if (score >= 3) {
            return { risk: T.stopBangIntermediateRisk, recommendation: T.stopBangIntermediateRiskRec };
        }
        return { risk: T.stopBangLowRisk, recommendation: T.stopBangLowRiskRec };
    }, [answers, score, T]);

    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setAnswers(prev => ({ ...prev, [name]: checked }));
    };

    const riskColorClass = risk === T.stopBangHighRisk ? 'bg-red-100 border-red-300' : risk === T.stopBangIntermediateRisk ? 'bg-amber-100 border-amber-300' : 'bg-green-100 border-green-300';
    const riskTextColorClass = risk === T.stopBangHighRisk ? 'text-red-900' : risk === T.stopBangIntermediateRisk ? 'text-amber-900' : 'text-green-900';

    const questions = [
        { key: 'snoring', text: T.stopBangSnoring }, { key: 'tired', text: T.stopBangTired },
        { key: 'observed', text: T.stopBangObserved }, { key: 'pressure', text: T.stopBangPressure },
        { key: 'bmi', text: T.stopBangBmi }, { key: 'age', text: T.stopBangAge },
        { key: 'neck', text: T.stopBangNeck }, { key: 'gender', text: T.stopBangGender },
    ];

    return (
        <div className="medical-card p-5 space-y-6">
            <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-brand-blue/10 rounded-lg">
                    <span title={T.iconLabelStethoscope}>
                        <Stethoscope className="w-5 h-5 text-brand-blue" />
                    </span>
                </div>
                <div>
                    <h3 className="text-md font-bold text-slate-900 leading-tight">{T.stopBangTitle}</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{T.stopBangSubtitle}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {questions.map(({ key, text }) => (
                    <label
                        key={key}
                        className={`flex items-center p-3.5 rounded-xl border transition-all cursor-pointer ${
                            answers[key]
                                ? 'bg-brand-blue/5 border-brand-blue/30 shadow-sm'
                                : 'bg-slate-50 border-slate-100 hover:border-brand-blue/20'
                        }`}
                    >
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
                            answers[key]
                                ? 'bg-brand-blue border-brand-blue text-white shadow-sm'
                                : 'bg-white border-slate-300'
                        }`}>
                            {answers[key] && (
                                <span title={T.iconLabelSelected}>
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                </span>
                            )}
                        </div>
                        <input
                            type="checkbox"
                            name={key}
                            checked={answers[key]}
                            onChange={handleCheckboxChange}
                            className="hidden"
                        />
                        <span className={`ml-3.5 text-sm font-bold ${
                            answers[key] ? 'text-slate-900' : 'text-slate-600'
                        }`}>{text}</span>
                    </label>
                ))}
            </div>

            <div className={`mt-6 p-5 rounded-2xl border shadow-sm ${
                risk === T.stopBangHighRisk ? 'bg-red-50 border-red-100' : 
                risk === T.stopBangIntermediateRisk ? 'bg-amber-50 border-amber-100' : 
                'bg-emerald-50 border-emerald-100'
            }`}>
                <h4 className={`text-[10px] font-black uppercase tracking-widest mb-2 ${
                    risk === T.stopBangHighRisk ? 'text-red-600' : 
                    risk === T.stopBangIntermediateRisk ? 'text-amber-600' : 
                    'text-emerald-600'
                }`}>{T.stopBangResultTitle}</h4>
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <p className="text-2xl font-black text-slate-900">{T.stopBangScore}: {score}</p>
                    <p className={`text-xs font-black uppercase tracking-widest ${
                        risk === T.stopBangHighRisk ? 'text-red-700' : 
                        risk === T.stopBangIntermediateRisk ? 'text-amber-700' : 
                        'text-emerald-700'
                    }`}>{risk}</p>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-200/50">
                    <p className="text-xs font-bold text-slate-600 flex items-start gap-2 leading-relaxed">
                        <span title={T.iconLabelInformation}>
                            <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                        </span>
                        {recommendation}
                    </p>
                </div>
            </div>
        </div>
    );
};

const ScoringSystems: React.FC<{ T: Record<string, any> }> = ({ T }) => (
    <div className="space-y-6">
        <GcsCalculator T={T} />
        <StopBangCalculator T={T} />
        <PonvCalculator T={T} />
    </div>
);

// --- ELECTROLYTE CALCULATORS ---

const AnionGapCalculator: React.FC<{ T: Record<string, any> }> = ({ T }) => {
    const [sodium, setSodium] = useState<number | ''>('');
    const [chloride, setChloride] = useState<number | ''>('');
    const [bicarb, setBicarb] = useState<number | ''>('');

    const result = useMemo(() => {
        if (sodium === '' || chloride === '' || bicarb === '') return null;
        const gap = sodium - (chloride + bicarb);
        let interpretation = '';
        if (gap > 12) interpretation = T.anionGapHigh;
        else if (gap < 8) interpretation = T.anionGapLow;
        else interpretation = T.anionGapNormal;
        return { value: gap.toFixed(0), interpretation };
    }, [sodium, chloride, bicarb, T]);

    return (
        <div className="medical-card p-5 space-y-6">
            <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-brand-blue/10 rounded-lg">
                    <span title={T.iconLabelCalculator}>
                        <Calculator className="w-5 h-5 text-brand-blue" />
                    </span>
                </div>
                <div>
                    <h3 className="text-md font-bold text-slate-900 leading-tight">{T.anionGapTitle}</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{T.anionGapSubtitle}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                        <span title={T.iconLabelActivity}>
                            <Activity className="w-3 h-3" />
                        </span>
                        {T.sodiumLabel}
                    </label>
                    <input 
                        type="number" 
                        value={sodium} 
                        onChange={e => setSodium(e.target.valueAsNumber || (e.target.value === '0' ? 0 : ''))} 
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-all outline-none" 
                        placeholder="Na+"
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                        <span title={T.iconLabelActivity}>
                            <Activity className="w-3 h-3" />
                        </span>
                        {T.chlorideLabel}
                    </label>
                    <input 
                        type="number" 
                        value={chloride} 
                        onChange={e => setChloride(e.target.valueAsNumber || (e.target.value === '0' ? 0 : ''))} 
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-all outline-none" 
                        placeholder="Cl-"
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                        <span title={T.iconLabelActivity}>
                            <Activity className="w-3 h-3" />
                        </span>
                        {T.bicarbonateLabel}
                    </label>
                    <input 
                        type="number" 
                        value={bicarb} 
                        onChange={e => setBicarb(e.target.valueAsNumber || (e.target.value === '0' ? 0 : ''))} 
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-all outline-none" 
                        placeholder="HCO3-"
                    />
                </div>
            </div>

            {result && (
                <div className="mt-6 p-5 bg-emerald-50 border border-emerald-100 rounded-2xl shadow-sm">
                    <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">{T.anionGapResult}</h4>
                    <p className="text-3xl font-black text-slate-900 leading-none">{result.value} <span className="text-sm font-bold text-slate-400">mEq/L</span></p>
                    <div className="mt-4 pt-4 border-t border-emerald-100">
                        <p className="text-sm font-bold text-slate-600 flex items-center gap-2">
                            <span title={T.iconLabelInformation}>
                                <Info className="w-4 h-4 text-emerald-500" />
                            </span>
                            {result.interpretation}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

const CorrectedSodiumCalculator: React.FC<{ T: Record<string, any> }> = ({ T }) => {
    const [measuredNa, setMeasuredNa] = useState<number | ''>('');
    const [glucose, setGlucose] = useState<number | ''>('');
    const [glucoseUnit, setGlucoseUnit] = useState<'mg/dL' | 'mmol/L'>('mg/dL');

    const result = useMemo(() => {
        if (measuredNa === '' || glucose === '') return null;
        
        const glucoseInMgDl = glucoseUnit === 'mg/dL' ? glucose : glucose * 18;
        
        if (glucoseInMgDl <= 100) {
            return { value: measuredNa.toFixed(1), note: "No correction needed (glucose is normal)." };
        }

        const correctionFactor = 2.4;
        const correctedValue = measuredNa + correctionFactor * ((glucoseInMgDl - 100) / 100);
        return { value: correctedValue.toFixed(1), note: null };
    }, [measuredNa, glucose, glucoseUnit]);

    return (
        <div className="medical-card p-5 space-y-6">
            <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-brand-blue/10 rounded-lg">
                    <span title={T.iconLabelCalculator}>
                        <Calculator className="w-5 h-5 text-brand-blue" />
                    </span>
                </div>
                <div>
                    <h3 className="text-md font-bold text-slate-900 leading-tight">{T.correctedSodiumTitle}</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{T.correctedSodiumSubtitle}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                        <span title={T.iconLabelActivity}>
                            <Activity className="w-3 h-3" />
                        </span>
                        {T.measuredSodiumLabel}
                    </label>
                    <input 
                        type="number" 
                        value={measuredNa} 
                        onChange={(e) => setMeasuredNa(e.target.valueAsNumber || (e.target.value === '0' ? 0 : ''))} 
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-all outline-none" 
                        placeholder="Na+ (mEq/L)"
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                        <span title={T.iconLabelFluids}>
                            <Droplets className="w-3 h-3" />
                        </span>
                        {T.glucoseLabel}
                    </label>
                    <div className="flex">
                        <input 
                            type="number" 
                            value={glucose} 
                            onChange={(e) => setGlucose(e.target.valueAsNumber || (e.target.value === '0' ? 0 : ''))} 
                            className="flex-grow p-3 bg-slate-50 border border-slate-200 rounded-l-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-all outline-none" 
                            placeholder="Glucose"
                        />
                        <select 
                            value={glucoseUnit} 
                            onChange={(e) => setGlucoseUnit(e.target.value as 'mg/dL' | 'mmol/L')} 
                            className="p-3 bg-slate-100 border-t border-r border-b border-slate-200 rounded-r-xl text-[10px] font-black uppercase tracking-widest text-slate-600 outline-none appearance-none"
                        >
                            <option>mg/dL</option>
                            <option>mmol/L</option>
                        </select>
                    </div>
                </div>
            </div>

            {result && (
                <div className="mt-6 p-5 bg-emerald-50 border border-emerald-100 rounded-2xl shadow-sm">
                    <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">{T.correctedSodiumResult}</h4>
                    <p className="text-3xl font-black text-slate-900 leading-none">{result.value} <span className="text-sm font-bold text-slate-400">mEq/L</span></p>
                    {result.note && (
                        <div className="mt-4 pt-4 border-t border-emerald-100">
                            <p className="text-sm font-bold text-slate-600 flex items-center gap-2">
                                <span title={T.iconLabelInformation}>
                                    <Info className="w-4 h-4 text-emerald-500" />
                                </span>
                                {result.note}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const FreeWaterDeficitCalculator: React.FC<{ T: Record<string, any> }> = ({ T }) => {
    const [weight, setWeight] = useState<number | ''>('');
    const [currentNa, setCurrentNa] = useState<number | ''>('');
    const [patientType, setPatientType] = useState('male');

    const result = useMemo(() => {
        if (weight === '' || weight <= 0 || currentNa === '') return null;
        
        if (currentNa <= 145) {
            return { deficit: '0.00', halfDeficit: '0.00', maxRate: '0.0', isNormal: true };
        }

        const tbwFactor = patientType === 'male' ? 0.6 : patientType === 'female' ? 0.5 : 0.6;
        const deficit = ((currentNa / 140) - 1) * (tbwFactor * weight);
        const halfDeficit = (deficit / 2).toFixed(2);
        const maxRate = (0.5 * weight).toFixed(1);
        return { deficit: deficit.toFixed(2), halfDeficit, maxRate, isNormal: false };
    }, [weight, currentNa, patientType]);

    return (
        <div className="medical-card p-5 space-y-6">
            <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-brand-blue/10 rounded-lg">
                    <span title={T.iconLabelFluids}>
                        <Droplets className="w-5 h-5 text-brand-blue" />
                    </span>
                </div>
                <div>
                    <h3 className="text-md font-bold text-slate-900 leading-tight">{T.freeWaterDeficitTitle}</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{T.freeWaterDeficitSubtitle}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                        <span title={T.iconLabelWeight}>
                            <Scale className="w-3 h-3" />
                        </span>
                        {T.weightKgLabel}
                    </label>
                    <input 
                        type="number" 
                        value={weight} 
                        onChange={e => setWeight(e.target.valueAsNumber || (e.target.value === '0' ? 0 : ''))} 
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-all outline-none" 
                        placeholder="kg"
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                        <span title={T.iconLabelActivity}>
                            <Activity className="w-3 h-3" />
                        </span>
                        {T.currentSodiumLabel}
                    </label>
                    <input 
                        type="number" 
                        value={currentNa} 
                        onChange={e => setCurrentNa(e.target.valueAsNumber || (e.target.value === '0' ? 0 : ''))} 
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-all outline-none" 
                        placeholder="Na+ (mEq/L)"
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                        <span title={T.iconLabelChecklist}>
                            <ClipboardList className="w-3 h-3" />
                        </span>
                        {T.patientTypeLabel}
                    </label>
                    <select 
                        value={patientType} 
                        onChange={e => setPatientType(e.target.value)} 
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-all outline-none appearance-none"
                    >
                        <option value="male">{T.patientTypeMale}</option>
                        <option value="female">{T.patientTypeFemale}</option>
                        <option value="child">{T.patientTypeChild}</option>
                    </select>
                </div>
            </div>

            {result && (
                <div className="mt-6 p-5 bg-emerald-50 border border-emerald-100 rounded-2xl shadow-sm">
                    <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">{T.freeWaterDeficitResult}</h4>
                    <p className="text-3xl font-black text-slate-900 leading-none">{result.deficit} <span className="text-sm font-bold text-slate-400">L</span></p>
                    {!result.isNormal && (
                        <div className="mt-6 pt-4 border-t border-emerald-100 space-y-3">
                            <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest flex items-center gap-1.5">
                                <span title={T.iconLabelChecklist}>
                                    <ClipboardList className="w-3 h-3" />
                                </span>
                                {T.correctionGuidance}
                            </p>
                            <div className="space-y-2">
                                <p className="text-xs font-bold text-slate-700 flex items-center gap-2">
                                    <span title={T.iconLabelArrowRight}>
                                        <ArrowRight className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                    </span>
                                    {T.correctionGuidance1(result.halfDeficit)}
                                </p>
                                <p className="text-xs font-bold text-slate-700 flex items-center gap-2">
                                    <span title={T.iconLabelArrowRight}>
                                        <ArrowRight className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                    </span>
                                    {T.correctionGuidance2}
                                </p>
                                <p className="text-xs font-bold text-slate-700 flex items-center gap-2">
                                    <span title={T.iconLabelArrowRight}>
                                        <ArrowRight className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                    </span>
                                    {T.correctionGuidance3(result.maxRate)}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const PotassiumReplacementGuide: React.FC<{ T: Record<string, any> }> = ({ T }) => {
    const guidelines = [
        { level: '> 3.5 mEq/L', oral: T.potassiumOral1, iv: T.potassiumIV1 },
        { level: '3.0 - 3.4 mEq/L', oral: T.potassiumOral2, iv: T.potassiumIV2 },
        { level: '2.5 - 2.9 mEq/L', oral: T.potassiumOral3, iv: T.potassiumIV3 },
        { level: '< 2.5 mEq/L', oral: T.potassiumOral4, iv: T.potassiumIV4 },
    ];
    return (
        <div className="medical-card p-5 space-y-6">
            <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-brand-blue/10 rounded-lg">
                    <span title={T.iconLabelChecklist}>
                        <ClipboardList className="w-5 h-5 text-brand-blue" />
                    </span>
                </div>
                <div>
                    <h3 className="text-md font-bold text-slate-900 leading-tight">{T.potassiumReplacementTitle}</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{T.potassiumReplacementSubtitle}</p>
                </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
                <table className="w-full text-sm text-left">
                    <thead className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-50">
                        <tr>
                            <th scope="col" className="px-5 py-4">{T.potassiumLevel}</th>
                            <th scope="col" className="px-5 py-4">{T.potassiumOral}</th>
                            <th scope="col" className="px-5 py-4">{T.potassiumIV}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {guidelines.map((g, i) => (
                            <tr key={g.level} className="hover:bg-slate-50/50 transition-colors">
                                <th scope="row" className="px-5 py-4 font-bold text-slate-900 whitespace-nowrap">{g.level}</th>
                                <td className="px-5 py-4 font-medium text-slate-600 leading-relaxed">{g.oral}</td>
                                <td className="px-5 py-4 font-medium text-slate-600 leading-relaxed">{g.iv}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="mt-6 p-5 bg-red-50 border border-red-100 rounded-2xl shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                    <span title={T.iconLabelWarning}>
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                    </span>
                    <h4 className="text-[10px] font-black text-red-600 uppercase tracking-widest">{T.importantSafetyNotes}</h4>
                </div>
                <ul className="space-y-2.5">
                    <li className="text-xs font-bold text-red-900/80 flex items-start gap-3 leading-relaxed">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                        {T.safetyNote1}
                    </li>
                    <li className="text-xs font-bold text-red-900/80 flex items-start gap-3 leading-relaxed">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                        {T.safetyNote2}
                    </li>
                    <li className="text-xs font-bold text-red-900/80 flex items-start gap-3 leading-relaxed">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                        {T.safetyNote3}
                    </li>
                </ul>
            </div>
        </div>
    );
};

const ElectrolyteCalculators: React.FC<{ T: Record<string, any> }> = ({ T }) => (
    <div className="space-y-6">
        <AnionGapCalculator T={T} />
        <FreeWaterDeficitCalculator T={T} />
        <CorrectedSodiumCalculator T={T} />
        <PotassiumReplacementGuide T={T} />
    </div>
);


// --- MAIN MODAL COMPONENT ---

export const ClinicalToolsModal: React.FC<ClinicalToolsModalProps> = ({ isOpen, onClose, T, language }) => {
    const [activeTab, setActiveTab] = useState<ActiveTab>('adultDrug');

    if (!isOpen) return null;

    const tabs: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
        { id: 'adultDrug', label: T.adultDrugDoseTab, icon: <span title={T.adultDrugDoseTab}><Pill className="w-4 h-4" /></span> },
        { id: 'paediatricDrug', label: T.paediatricDrugDoseTab, icon: <span title={T.paediatricDrugDoseTab}><Activity className="w-4 h-4" /></span> },
        { id: 'fluid', label: T.fluidManagementTab, icon: <span title={T.fluidManagementTab}><Droplets className="w-4 h-4" /></span> },
        { id: 'scoring', label: T.scoringSystemsTab, icon: <span title={T.scoringSystemsTab}><ClipboardList className="w-4 h-4" /></span> },
        { id: 'electrolytes', label: T.electrolytesTab, icon: <span title={T.electrolytesTab}><Zap className="w-4 h-4" /></span> },
        { id: 'ecg', label: T.ecgInterpretationTab, icon: <span title={T.ecgInterpretationTab}><Activity className="w-4 h-4" /></span> },
    ];

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" aria-modal="true" role="dialog">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden border border-white/20">
                <header className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-brand-blue rounded-xl shadow-lg shadow-brand-blue/20">
                            <span title={T.clinicalToolsTitle}>
                                <Stethoscope className="w-6 h-6 text-white" />
                            </span>
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-900 leading-tight">{T.clinicalToolsTitle}</h2>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{T.clinicalDecisionSupport}</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all" 
                        aria-label="Close"
                        title={T.closeButton}
                    >
                        <span title={T.closeButton}>
                            <X className="w-6 h-6" />
                        </span>
                    </button>
                </header>
                
                <div className="bg-white border-b border-slate-100 px-4">
                    <nav className="flex space-x-1 overflow-x-auto no-scrollbar py-2" aria-label="Tabs">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 whitespace-nowrap py-2.5 px-4 rounded-xl font-bold text-xs transition-all ${
                                    activeTab === tab.id
                                        ? 'bg-brand-blue text-white shadow-md shadow-brand-blue/20'
                                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                                }`}
                            >
                                {tab.icon}
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>

                <main className="p-6 overflow-y-auto flex-grow bg-slate-50/50 custom-scrollbar">
                    <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl mb-8 flex items-start gap-4 shadow-sm">
                        <div className="p-2 bg-amber-100 rounded-lg">
                            <span title={T.medicalDisclaimer}>
                                <AlertTriangle className="w-5 h-5 text-amber-600" />
                            </span>
                        </div>
                        <div>
                            <h4 className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-1">{T.medicalDisclaimer}</h4>
                            <p className="text-xs font-bold text-amber-900/70 leading-relaxed">
                                {T.calculatorDisclaimer}
                            </p>
                        </div>
                    </div>

                    <div className="animate-fade-in">
                        {activeTab === 'paediatricDrug' && <DoseCalculator T={T} language={language} database={paediatricDrugDatabase} />}
                        {activeTab === 'adultDrug' && <DoseCalculator T={T} language={language} database={adultDrugDatabase} />}
                        {activeTab === 'fluid' && <FluidManagementCalculator T={T} />}
                        {activeTab === 'scoring' && <ScoringSystems T={T} />}
                        {activeTab === 'electrolytes' && <ElectrolyteCalculators T={T} />}
                        {activeTab === 'ecg' && <EcgInterpreter T={T} language={language} />}
                    </div>
                </main>

                <footer className="p-6 border-t border-slate-100 bg-white flex justify-end">
                    <button 
                        onClick={onClose} 
                        className="bg-slate-900 hover:bg-slate-800 text-white font-black py-3 px-10 rounded-2xl transition-all shadow-lg shadow-slate-900/10 uppercase tracking-widest text-xs"
                    >
                        {T.closeButton}
                    </button>
                </footer>
            </div>
        </div>
    );
};
