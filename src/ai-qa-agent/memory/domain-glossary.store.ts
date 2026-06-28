/**
 * Domain glossary — team-curated definitions of project-specific terms.
 * Used by the stakeholder HTML report so a PM reading "B2B offer flow"
 * sees a one-line definition next to it, and by Claude Code so it
 * understands what `OrderType.SUBSCRIPTION` means in this codebase.
 *
 * This is the FIRST piece teams customise after installing the framework
 * on their project — hand-edit `.aiqa-memory/domain-glossary.json`.
 */

import { appendRecord, loadDoc } from "./store-base";

export const DOMAIN_GLOSSARY_SCHEMA = "aiqa.domain-glossary.v1";

export interface GlossaryTerm {
    term: string;                       // e.g. "Offer"
    plainEnglish: string;               // one-sentence definition for non-engineers
    /** Domain-engineering definition, optional — what dev needs to know. */
    engineeringNotes?: string;
    /** Aliases — synonyms the report should fold into this entry. */
    aliases?: string[];
    /** Pages / features this term lives on. */
    relatedFeatures?: string[];
    addedAt: string;
}

export function listGlossary(): GlossaryTerm[] {
    return loadDoc<GlossaryTerm>("domain-glossary", DOMAIN_GLOSSARY_SCHEMA).records;
}

export function findTerm(termOrAlias: string): GlossaryTerm | undefined {
    const needle = termOrAlias.toLowerCase().trim();
    return listGlossary().find(t =>
        t.term.toLowerCase() === needle
        || (t.aliases ?? []).some(a => a.toLowerCase() === needle)
    );
}

export function addTerm(input: Omit<GlossaryTerm, "addedAt">): GlossaryTerm {
    const record: GlossaryTerm = { ...input, addedAt: new Date().toISOString() };
    appendRecord("domain-glossary", DOMAIN_GLOSSARY_SCHEMA, record);
    return record;
}
