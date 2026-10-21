/**
 * Compares the running composition against what this bundle sets, row by row,
 * and explains every difference. Pure: callers supply the rows and layers.
 * @module dsh-off-the-record/otr-settings/check
 */
/** The parts of a Loader entry the check reads. */
export interface RowView {
    readonly id: string;
    readonly disabled?: unknown;
    readonly config?: unknown;
}
/** A configuration layer above this bundle that may override its rows. */
export interface LaterLayer {
    /** Where the layer lives, such as a file path or `--patch overlay`. */
    readonly label: string;
    /** Whether the layer names this row id. */
    mentions(id: string): boolean;
}
/** One managed channel's state. */
export type ChannelState = 
/** The bundle's setting is in force. */
'off'
/** A later layer, or a harness change, turned the channel back on. */
 | 'on'
/** The row no longer exists in this harness release; the bundle cannot manage it. */
 | 'missing'
/** The row only exists in some profiles (desktop analytics), and not in this one. */
 | 'not-present';
export interface ChannelStatus {
    readonly id: string;
    readonly part: 'telemetry' | 'search';
    readonly label: string;
    readonly state: ChannelState;
    /** The later layer that names this row, when the state is `on`. */
    readonly changedBy?: string;
    /** How to restore the bundle's setting; present for `on` and `missing`. */
    readonly fix?: string;
}
export interface SearchStatus {
    readonly provider: string;
    readonly fetchProvider: string;
    /** Whether the selected provider is one of this bundle's. */
    readonly private: boolean;
}
export interface CompositionReport {
    readonly channels: readonly ChannelStatus[];
    readonly search: SearchStatus;
}
interface Channel {
    readonly id: string;
    readonly part: 'telemetry' | 'search';
    readonly label: string;
    /** Rows that exist only in some profiles report `not-present` instead of `missing`. */
    readonly optional?: boolean;
    /** Whether the row is in the state this bundle sets. */
    readonly isOff: (row: RowView) => boolean;
}
/** Every channel this bundle manages, in display order. */
export declare const CHANNELS: readonly Channel[];
/** Search providers this bundle ships. */
export declare const PRIVATE_SEARCH_PROVIDERS: readonly string[];
/**
 * Check the composition.
 * @param rows - every Loader entry, flattened.
 * @param layers - layers that apply after this bundle, highest precedence first.
 * @returns one status per managed channel, and the search selection.
 */
export declare function checkComposition(rows: readonly RowView[], layers: readonly LaterLayer[]): CompositionReport;
/**
 * Turn a report into log lines: one summary, and one warning per problem.
 * @param report - the composition report.
 * @returns the summary and warnings.
 */
export declare function describeReport(report: CompositionReport): {
    summary: string;
    warnings: string[];
};
export {};
