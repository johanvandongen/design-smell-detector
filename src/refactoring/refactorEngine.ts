import cytoscape from 'cytoscape';
// @ts-ignore
import { nodeHasLabel, edgeHasLabel, nodeHasKind } from '../utilities/utils.js';

export type RefactorSuggestion =
    | ExtractInterfaceSuggestion
    | DependencyInjectionSuggestion;

export interface ExtractInterfaceSuggestion {
    kind: "extract-interface";
    sourceClass: string;
    targetClass: string;
    description: string;
}

export interface DependencyInjectionSuggestion {
    kind: "dependency-injection";
    sourceClass: string;
    targetClass: string;
    fieldId: string;
    description: string;
}

export class RefactorEngine {
    private cy: cytoscape.Core; // Graph that can be queried. We use cytocape, but any type that provides this functionality works. We dont use it for rendering.

    constructor(cy: cytoscape.Core) {
        this.cy = cy
    }
    
    /** @param scc list of node IDs that form a strongly connected component */
    public suggestRefactoringsForSCC(scc: string[]): RefactorSuggestion[] {
        const refactorings = [...this.extractInterface(scc), ...this.dependencyInjection(scc)];
        const mergedRefactorings = this.mergeRefactorings(refactorings)
        // for (const r of mergedRefactorings) {
        //     console.log(r);
        // }
        return mergedRefactorings;
    }

    /** Merges refactorings of the same type. */
    private mergeRefactorings(refactorings: RefactorSuggestion[]) {
        const groupByNameAndTarget = (arr: RefactorSuggestion[]): RefactorSuggestion[][] => {
            const result: { [key: string]: { [key: string]: RefactorSuggestion[] } } = {}
            for (let i=0; i<arr.length; i++) {
                if (!Object.hasOwn(result, arr[i].kind)) {
                    result[arr[i].kind] = {};
                }

                if (!Object.hasOwn(result[arr[i].kind], arr[i].targetClass)) {
                    result[arr[i].kind][arr[i].targetClass] = [];
                }

                result[arr[i].kind][arr[i].targetClass].push(arr[i]);
            }

            // Transform result back into more convenient format
            const resultFlat: RefactorSuggestion[][] = []
            for (const [nameKey, value] of Object.entries(result)) {
                for (const [targetKey, value] of Object.entries(result[nameKey])) {
                    resultFlat.push(result[nameKey][targetKey])
                }
            }
            return resultFlat;
        }

        // Merge refactorings
        const groupedRefactorings: RefactorSuggestion[][] = groupByNameAndTarget(refactorings);
        const mergedRefactorings: RefactorSuggestion[] = [];
        for (const group of groupedRefactorings) {
            const mergedRefactoring: RefactorSuggestion = group[0];
            // mergedRefactoring.descriptions = []
            // for (let r of group) {
            //     mergedRefactoring.descriptions.push(r.description);
            // }
            mergedRefactorings.push(mergedRefactoring);
        }

        return mergedRefactorings
    }

    private dependencyInjection(scc: string[]) {
        const refactorings: DependencyInjectionSuggestion[] = []
        scc.forEach((nodeId) => {
            const currtentClass = this.cy.getElementById(nodeId);
            currtentClass.children().forEach((child) => {
                if (nodeHasKind(child, "field")) {
                    const instantiatesEdges = child.outgoers().filter((e) => edgeHasLabel(e, 'instantiates'))
                    if (instantiatesEdges.length > 0) {
                        const target = instantiatesEdges[0].target();
                        refactorings.push({
                            sourceClass: currtentClass.id(),
                            targetClass: target.id(),
                            description: `Field Declaration ${child.data("name")}`,
                            kind: 'dependency-injection',
                            fieldId: child.id()
                        })
                    }
                }
            })
        })
        return refactorings;
    }

    private extractInterface(scc: string[]) {
        const refactorings: ExtractInterfaceSuggestion[] = []
        scc.forEach((nodeId) => {
            const currtentClass = this.cy.getElementById(nodeId);
            currtentClass.children().forEach((child) => {

                // Field Declaration
                if (nodeHasKind(child, "field")) {
                    child.outgoers().filter((e) => edgeHasLabel(e, 'typed')).forEach((edge) => {
                        const target = edge.target();
                        const targetKind = target.data("properties.kind");
                        // console.log(`Field ${currtentClass.data("name")}.${child.data("name")} has type ${target.data("label")} (${targetKind})`);
                        if (targetKind !== "interface" && scc.includes(target.id())) {
                            refactorings.push({
                                sourceClass: currtentClass.id(),
                                targetClass: target.id(),
                                description: `Field Declaration ${child.data("name")}`,
                                kind: 'extract-interface'
                            });
                        }
                    });
                }

                // Method return type
                if (nodeHasKind(child, "method")) {
                    child.outgoers().filter((e) => edgeHasLabel(e, 'returns')).forEach((edge) => {
                        const target = edge.target();
                        const targetKind = target.data("properties.kind");
                        // console.log(`Method ${currtentClass.data("name")}.${child.data("name")} returns type ${target.data("label")} (${targetKind})`);
                        if (targetKind !== "interface" && scc.includes(target.id())) {
                            refactorings.push({
                                sourceClass: currtentClass.id(),
                                targetClass: target.id(),
                                description: `Method return type ${child.data("name")}`,
                                kind: 'extract-interface'
                            });
                        }
                    });
                }

                // Method parameter type
                if (nodeHasKind(child, "method")) {
                    child.outgoers().filter((e) => edgeHasLabel(e, 'parameterizes')).forEach((edge) => {
                        const target = edge.target();
                        const targetKind = target.data("properties.kind");
                        // console.log(`Method ${currtentClass.data("name")}.${child.data("name")} parameterizes type ${target.data("label")} (${targetKind})`);
                        if (targetKind !== "interface" && scc.includes(target.id())) {
                            refactorings.push({
                                kind: `extract-interface`,
                                sourceClass: currtentClass.id(),
                                targetClass: target.id(),
                                description: `Method return type ${child.data("name")}`
                            });
                        }
                    });
                }
            });
        });
        return refactorings;
    }
}
