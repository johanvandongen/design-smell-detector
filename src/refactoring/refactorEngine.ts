import cytoscape from 'cytoscape';
// @ts-ignore
import { nodeHasLabel, edgeHasLabel, nodeHasKind } from '../utilities/utils.js';

export type RefactorSuggestion =
    | ExtractInterfaceSuggestion
    | DependencyInjectionSuggestion
    | MoveMethodSuggestion;

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

export interface MoveMethodSuggestion {
    kind: "move-method";
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
        const refactorings = [...this.extractInterface(scc), ...this.dependencyInjection(scc), ...this.moveMethod(scc)];
        const mergedRefactorings = this.mergeRefactorings(refactorings)
        // for (const r of mergedRefactorings) {
        //     console.log(r);
        // }
        return mergedRefactorings;
    }

    private moveMethod(scc: string[]): MoveMethodSuggestion[] {
        // Identification of Move Method Refactoring Opportunities | 10.1109/TSE.2009.1.
        const refactorings: MoveMethodSuggestion[] = []
        scc.forEach((nodeId) => {
            const currtentClass = this.cy.getElementById(nodeId);
            currtentClass.children().forEach((child) => {

                // Hacky fix. Graph should contain information about whether a method is abstract or not, but it currently does not. So we check the source text for the word "abstract" to determine if it is abstract.
                const abstract = (n: cytoscape.NodeSingular) => nodeHasKind(n, "method") && (n.data("properties.sourceText").includes("abstract") || isInterface(n.parent().first()))
                const fieldIsNotPrivate = (n: cytoscape.NodeSingular) => nodeHasKind(n, "field") && n.data("properties.visibility") !== "private";
                const isInterface = (n: cytoscape.NodeSingular) => n.data("properties.kind") === "interface"
                const hasParameterOfType = (method: cytoscape.NodeSingular, targetClass: cytoscape.NodeSingular): boolean => {
                    return hasType(method, targetClass, 'parameterizes');
                };

                
                /**
                 * 
                 * @param n node you want to check the type of
                 * @param targetClass the type you want to check against
                 * @param edgeType how can we get from the node to the type? For example, a field node we can look at 'typed' edges, and for methods we look at 'parameterizes' or 'returns' edges.
                 * @param checkArrayLike additional check to see if the type is contained in an array
                 */
                const hasType = (n: cytoscape.NodeSingular, targetClass: cytoscape.NodeSingular, edgeType: string, checkArrayLike: boolean = false): boolean => {
                    const edges = n.outgoers().edges().filter(e => edgeHasLabel(e, edgeType));
                    for (const edge of edges) {
                        if (edge.target().id() === targetClass.id()) {
                            return checkArrayLike ? edge.data("properties.kind") === "array type" : true;
                        }
                    }
                    return false;
                }

                const hasReferenceToTargetClass = (method: cytoscape.NodeSingular, targetClass: cytoscape.NodeSingular): boolean => {
                    return hasParameterOfType(method, targetClass) || hasFieldOfType(method, targetClass);
                }

                const hasFieldOfType = (method: cytoscape.NodeSingular, targetClass: cytoscape.NodeSingular): boolean => {
                    const fields = inheritedFields(method.parent().first()).union(method.parent().first().children().filter((child) => nodeHasKind(child, "field"))).nodes();
                    return fields.toArray().some((field) => hasType(field, targetClass, "typed"));
                }

                const getSuperClass = (clasz: cytoscape.NodeSingular): cytoscape.NodeSingular | null => {
                    const specializeEdges = clasz.outgoers().filter((e) => edgeHasLabel(e, "specializes")).edges()
                    if (specializeEdges.length >= 2) {
                        throw new Error(`Class ${clasz.data("name")} has multiple specialize edges. This is not supported.`);
                    }

                    if (specializeEdges.length === 0) {
                        return null;
                    }
                    return specializeEdges.first().target();
                }
                const abstractMethodsToBeOverridden = (clasz: cytoscape.NodeSingular): string[] => {
                    const superClass = getSuperClass(clasz);
                    if (!superClass) { return []; }
                    const abstractMethods = superClass.children().filter((child) => nodeHasKind(child, "method") && abstract(child)).map((method) => method.data("properties.simpleName"));
                    return abstractMethods.concat(abstractMethodsToBeOverridden(superClass));
                }

                const inheritedFields = (clasz: cytoscape.NodeSingular): cytoscape.NodeCollection => {
                    const superClass = getSuperClass(clasz);
                    if (!superClass) { return this.cy.collection(); }
                    const fields = superClass.children().filter((child) => nodeHasKind(child, "field") && fieldIsNotPrivate(child)).nodes()
                    return fields.union(inheritedFields(superClass));
                }

                const inheritedMethods = (clasz: cytoscape.NodeSingular): cytoscape.NodeCollection => {
                    const superClass = getSuperClass(clasz);
                    if (!superClass) { return this.cy.collection(); }
                    const methods = superClass.children().filter((child) => nodeHasKind(child, "method") && !abstract(child)).nodes()
                    return methods.union(inheritedMethods(superClass));
                }

                const behaviourPreserving = (method: cytoscape.NodeSingular, targetClass: cytoscape.NodeSingular): boolean => {
                    const targetClassShouldNotInheritMethodWithSameMethodSignature = !inheritedMethods(targetClass).toArray().some((inheritedMethod) => method.data("properties.simpleName") === inheritedMethod.data("properties.simpleName"));
                    const movedMethodShouldNotOverrideInheritedMethod = !inheritedMethods(method.parent().first()).toArray().some((inheritedMethod) => method.data("properties.simpleName") === inheritedMethod.data("properties.simpleName"));
                    const movedMethodShouldHaveReferenceToTargetClass = hasReferenceToTargetClass(method, targetClass);
                    const movedMethodShouldNotBeSynchronized = true; // TODO: graph should contain information about whether a method is synchronized or not, but it currently does not. So we cannot check if the method is synchronized. This is a limitation of the current implementation.
                    return targetClassShouldNotInheritMethodWithSameMethodSignature && movedMethodShouldNotOverrideInheritedMethod && movedMethodShouldHaveReferenceToTargetClass && movedMethodShouldNotBeSynchronized;
                }

                const hasAssignment = (sourceText: string, variable: string ) => {
                    return sourceText.includes(`${variable} =`) || sourceText.includes(`${variable}=`) || sourceText.includes(`--${variable}`) || sourceText.includes(`${variable}--`) || sourceText.includes(`++${variable}`) || sourceText.includes(`${variable}++`);
                }
                // Check if a method has an assignment to a field of the class it is in. This is a heuristic to check if the method is a setter or not. It is not perfect, but it is good enough for now.
                // Ideally the graph should contain more structured information about the method body
                const hasClassFieldAssignment = (method: cytoscape.NodeSingular) => {
                    const fields = inheritedFields(method.parent().first()).union(method.parent().first().children().filter((child) => nodeHasKind(child, "field"))).nodes();
                    const fieldNames = fields.map((field) => field.data("properties.simpleName"));
                    method.outgoers().filter((e) => edgeHasLabel(e, 'uses')).forEach((edge) => {
                        const variableName = edge.target().data("properties.simpleName");
                        if (fieldNames.includes(variableName)) {
                            if (hasAssignment(method.data("properties.sourceText"), variableName)) {
                                return true;
                            }
                        }
                    })
                    return false
                }

                const oneToOneRelationship = (method: cytoscape.NodeSingular, targetClass: cytoscape.NodeSingular): boolean => {
                    // Graph should contain more information. It currently doesnt include typed edges to primitive types like array to check this.
                    const fields = inheritedFields(method.parent().first()).union(method.parent().first().children().filter((child) => nodeHasKind(child, "field"))).nodes();
                    const fieldWithOneToManyRelationshipExists = fields.toArray().some((field) => hasType(field, targetClass, "typed", true));
                    const parameterWithOneToManyRelationshipExists = hasType(method, targetClass, 'parameterizes', true);
                    return !fieldWithOneToManyRelationshipExists && !parameterWithOneToManyRelationshipExists;

                }

                const qualityPreconditions = (method: cytoscape.NodeSingular, targetClass: cytoscape.NodeSingular): boolean => {
                    const noSourceFieldAssignments = !hasClassFieldAssignment(method);
                    const hasOneToOneRelationship = oneToOneRelationship(method, targetClass);
                    return noSourceFieldAssignments && hasOneToOneRelationship;
                }

                const similarLocalMethodInTargetClass = (method: cytoscape.NodeSingular, targetClass: cytoscape.NodeSingular): boolean => {
                    // Methods can have same name but different parameters, so this is not a perfect check. But it is a good enough heuristic for now.
                    const targetMethods = targetClass.children().filter((child) => nodeHasKind(child, "method")).nodes();
                    return targetMethods.toArray().some((targetMethod) => method.data("properties.simpleName") === targetMethod.data("properties.simpleName"));
                } 

                const isCompilationSafe = (method: cytoscape.NodeSingular, targetClass: cytoscape.NodeSingular): boolean => {
                    const targetClassShouldNotHaveSameMethodSignature = !similarLocalMethodInTargetClass(method, targetClass);
                    const movedMethodShouldNotOverrideAbstractMethod = !abstractMethodsToBeOverridden(method.parent().first()).includes(method.data("properties.simpleName"));
                    const movedMethodShouldNotBeAbstract = !abstract(method);
                    const targetShouldNotBeInterface = !isInterface(targetClass);
                    const movedMethodShouldNotCallSuper = true; // TODO: graph should contain information about method calls, but it currently does not. So we cannot check if the method calls super. This is a limitation of the current implementation.
                    return targetClassShouldNotHaveSameMethodSignature && movedMethodShouldNotOverrideAbstractMethod && movedMethodShouldNotBeAbstract && targetShouldNotBeInterface && movedMethodShouldNotCallSuper;
                }
                const canMoveMethod = (method: cytoscape.NodeSingular, targetClass: cytoscape.NodeSingular) => {
                    return isCompilationSafe(method, targetClass) && behaviourPreserving(method, targetClass) && qualityPreconditions(method, targetClass);
                }

                // Method call
                if (nodeHasKind(child, "method")) {
                    child.outgoers().filter((e) => edgeHasLabel(e, 'returns') || edgeHasLabel(e, 'parameterizes')).forEach((edge) => {
                        const target = edge.target();
                        const targetKind = target.data("properties.kind");
                        console.log(canMoveMethod(child, target), "can move method", child.data("name"), "from", currtentClass.data("name"), "to", target.data("name"))
                        if (scc.includes(target.id()) && canMoveMethod(child, target)) {
                            refactorings.push({
                                sourceClass: currtentClass.id(),
                                targetClass: target.id(),
                                fieldId: child.id(),
                                description: `Method ${child.data("name")}`,
                                kind: 'move-method'
                            });
                        }
                        // console.log(`Method ${currtentClass.data("name")}.${child.data("name")} has type ${target.data("label")} (${targetKind})`);
                    });
                }
            })
        })

        return refactorings;
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
