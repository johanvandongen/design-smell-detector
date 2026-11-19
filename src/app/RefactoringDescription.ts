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
export interface DependencyDescription {
    source: string;
    target: string;
    types: string[];
}
export class CycleDescription {
    private cycle: DependencyDescription[] = [];

    addDependencyDecription = (dep: DependencyDescription) => {
        this.cycle.push(dep)
    }

    render = () => {
        if (!this.cycle.length) return null;

        return h('section', { class: 'report-section' }, [
            h('h4', {}, 'Resulting cycle'),
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
    private dependencies: DependencyDescription[] = []
    private dependenciesOutsideFocus: DependencyDescription[] = []
    private type: DependencyChangeType = 'added';

    constructor(type: DependencyChangeType) {
        this.type = type
    }

    addDependencyDecription = (dep: DependencyDescription, inFocus: boolean = true) => {
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
    private resultingCycle?: CycleDescription
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

    addResultingCycle(resultingCycle: CycleDescription) {
        this.resultingCycle = resultingCycle
    }

    appendChangeDescription(type: DependencyChangeType, dep: DependencyDescription, inFocus: boolean = true) {
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
        return h('div', { class: 'refactoring-report' }, [
            h('div', { class: 'report-title' }, [
                h('div', {}, [
                    // h('span', { class: 'report-eyebrow' }, 'REFACTORING'),
                    h('h3', {}, this.name),
                    h('span', { class: 'report-subtitle' }, this.description ? `${this.description}` : '')
                ])
            ]),

            this.cycleImpact ? this.cycleImpact.render() : "",
            this.resultingCycle ?  this.resultingCycle.render() : "",
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