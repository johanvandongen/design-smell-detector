//@ts-ignore
import { $, $all, h, on, r } from '../utilities/shorthands.js';

type CycleImpactStatus = 'resolved' | 'remains' | 'shifted' | 'partially-resolved'
class CycleImpact {
    status: CycleImpactStatus;
    description: string;

    constructor(status: CycleImpactStatus, description: string) {
        this.status = status;
        this.description = description
    }

    render() {
        const statusText = {
            resolved: 'Cycle resolved',
            'partially-resolved': 'Cycle partially resolved',
            remains: 'Cycle remains',
            shifted: 'Cycle shifted'
        };

        return h('section', { class: 'report-section' }, [
            h('h4', {}, 'Cycle impact'),
            h('div', { class: `cycle-status ${this.status}` }, [
                h('span', { class: 'status-icon' }, {
                    resolved: '✓',
                    'partially-resolved': '✓',
                    remains: '!',
                    shifted: '↔'
                }[this.status] ?? '!'),
                h('div', {}, [
                    h('strong', {}, statusText[this.status] ?? 'Cycle impact'),
                    h('p', {}, this.description)
                ])
            ])
        ]);
    }
}

export class InspectDescription {
    private scc: DependencyList
    private subCycles: DependencyList[]
    private sccSize: number;

    constructor(scc: DependencyList, subCycles: DependencyList[], sccSize: number) {
        this.scc = scc;
        this.subCycles = subCycles;
        this.sccSize = sccSize;
    }

    render = () => {
        if (!this.subCycles || this.subCycles.length === 0) {
            this.scc.setTitle(null);
            return this.scc.render()
        }

        this.subCycles.forEach((s, idx) => s.setTitle(`Subcycle ${idx+1}`))
        this.scc.setTitle("Entire Strongly Connected Component")
        return h('div', { class: 'refactoring-report' }, [
            h('section', { class: 'report-section' }, [
               h('p', {}, `SCC contains ${this.sccSize} classes and many subcycles. A few are listed below.`)
            ]),
            h('section', { class: 'report-section' }, [
                ...this.subCycles.map((s) => s.render()),
            ]),
            h('section', { class: 'report-section' }, [
                this.scc.render()
            ])
        ])
    };
}
export interface DependencyItem {
    source: string;
    target: string;
    types: string[];
}
export class DependencyList {
    private cycle: DependencyItem[] = [];
    private title: string | null = 'Resulting SCC';

    constructor(cycle: DependencyItem[] = []) {
        this.cycle = cycle;
    }

    addDependencyDecription = (dep: DependencyItem) => {
        this.cycle.push(dep)
    }

    setTitle(title: string | null) {
        this.title = title;
    }

    render = () => {
        if (!this.cycle.length) return null;

        return h('section', { class: 'report-section' }, [
            ...(this.title === null ? [] : [h('h4', {}, this.title)]),
            h('div', { class: 'cycle-list' },
                this.cycle.map(edge =>
                    h('div', { class: 'cycle-edge' }, [
                        h('strong', {}, `${edge.source} → ${edge.target}`),
                        h('span', {}, edge.types.join(' · '))
                    ])
                )
            )
        ]);
    };
}

type DependencyChangeType = 'added' | 'removed'
class DependencyChanges {
    private dependencies: DependencyItem[] = []
    private dependenciesOutsideFocus: DependencyItem[] = []
    private type: DependencyChangeType = 'added';

    constructor(type: DependencyChangeType) {
        this.type = type
    }

    addDependencyDecription = (dep: DependencyItem, inFocus: boolean = true) => {
        if (inFocus) {
            this.dependencies.push(dep);
        } else {
            this.dependenciesOutsideFocus.push(dep);
        }
    }

    render = () => {
        if (!this.dependencies?.length) return "";

        return h('div', { class: `change-group ${this.type}` }, [
            h('div', { class: 'change-heading' }, [
                h('span', {}, this.type === 'added' ? '＋' : '−'),
                this.type === 'added' ? 'Added dependencies' : 'Removed dependencies'
            ]),
            h('ul', {}, [
                ...this.dependencies.map(dependency =>
                    h('li', {}, [
                        h('strong', {}, `${dependency.source} → ${dependency.target}`),
                        h('span', {}, dependency.types.join(', '))
                    ])
                )
            ]),
            this.dependenciesOutsideFocus.length === 0 ? "" : h('p', { class: 'change-overflow' },`${this.type === 'added' ? '+' : '−'} ${this.dependenciesOutsideFocus.length} more dependencies outside focus set`)
        ]);
    };
}
export class RefactoringDescription {
    
    public name: string;
    public description: string;
    public cycleImpact?: CycleImpact
    private resultingSCCs: DependencyList[] = []
    private addedDependencies?: DependencyChanges = new DependencyChanges('added')
    private removedDependencies?: DependencyChanges = new DependencyChanges('removed')
    private detailsDescription: string = ""

    constructor(name: string, description: string) {
        this.name = name;
        this.description = description;
    }

    addCycleImpact(status: CycleImpactStatus, description: string) {
        this.cycleImpact = new CycleImpact(status, description)
    }

    addResultingSCCs(resultingSCCs: DependencyList[]) {
        this.resultingSCCs = resultingSCCs
    }

    appendChangeDescription(type: DependencyChangeType, dep: DependencyItem, inFocus: boolean = true) {
        if (type === 'added') {
            this.addedDependencies?.addDependencyDecription(dep, inFocus)
        } else if (type === 'removed') {
            this.removedDependencies?.addDependencyDecription(dep, inFocus)
        }
    }

    addDetailsDesription(description: string) {
        this.detailsDescription = description
    }

    render() {
        
        if (this.resultingSCCs.length === 1) {
            this.resultingSCCs[0].setTitle("Resulting SCC")
        } else if (this.resultingSCCs.length > 1) {
            this.resultingSCCs.forEach((scc, idx) => scc.setTitle(`Resulting SCC ${idx+1}`))
        }
        return h('div', { class: 'refactoring-report' }, [
            h('div', { class: 'report-title' }, [
                h('div', {}, [
                    // h('span', { class: 'report-eyebrow' }, 'REFACTORING'),
                    h('h3', {}, this.name),
                    h('span', { class: 'report-subtitle' }, this.description ? `${this.description}` : '')
                ])
            ]),

            this.cycleImpact ? this.cycleImpact.render() : "",
            ...this.resultingSCCs.map((scc) => scc.render()),
            h('section', { class: 'report-section' }, [
                h('h4', {}, 'Dependency changes'),
                this.addedDependencies ? this.addedDependencies.render() : "",
                this.removedDependencies ? this.removedDependencies.render() : "",
            ]),
            this.detailsDescription === "" ? "" : h('section', { class: 'report-section' }, [
                h('h4', {}, 'Refactoring details'),
                h('div', { class: 'technique-details' }, [
                    this.detailsDescription
                ])
            ])
        ]);
    }
}