import cytoscape from 'cytoscape';
// @ts-ignore
import { edgeHasLabel, nodeHasKind } from '../utilities/utils.js';

export interface MoveMethodSuggestion {
    kind: "move-method";
    sourceClass: string;
    targetClass: string;
    methodId: string;
    description: string;
    newMethodReference: 'parameter' | 'field'; // How can this new method be called from the original callers? 'parameter' when callers used targetClass as parameter, 'field' otherwise (original callers use sourceclass field to access new method)
}

/**
 * @class moveMethodDetector finds suitable candidates for the move method refactoring.
 * It implements the algorithm described in "Identification of Move Method Refactoring Opportunities" (doi: 10.1109/TSE.2009.1.)
 */
export class MoveMethodDetector {
    private cy: cytoscape.Core;

    constructor(cy: cytoscape.Core) {
        this.cy = cy
    }

    public detect(scc: string[]): MoveMethodSuggestion[] {
        const refactorings: MoveMethodSuggestion[] = []
        scc.forEach((nodeId) => {
            const currtentClass = this.cy.getElementById(nodeId);
            currtentClass.children().forEach((child) => {
                if (nodeHasKind(child, "method")) {
                    child.outgoers().filter((e) => edgeHasLabel(e, 'returns') || edgeHasLabel(e, 'parameterizes')).forEach((edge) => {
                        const target = edge.target();
                        if (scc.includes(target.id()) && this.canMoveMethod(child, target)) {
                            refactorings.push({
                                sourceClass: currtentClass.id(),
                                targetClass: target.id(),
                                methodId: child.id(),
                                description: `Move  method ${child.data("name")} to class ${target.data("properties.simpleName")}`,
                                newMethodReference: this.hasParameterOfType(child, target) ? 'parameter' : 'field',
                                kind: 'move-method'
                            });
                        }
                    });
                }
            })
        })

        return refactorings;
    }

    private canMoveMethod = (method: cytoscape.NodeSingular, targetClass: cytoscape.NodeSingular) => {
        return this.isCompilationSafe(method, targetClass) && this.isBehaviourPreserving(method, targetClass) && this.passesQualityMeasures(method, targetClass);
    }
    
    private isCompilationSafe = (method: cytoscape.NodeSingular, targetClass: cytoscape.NodeSingular): boolean => {
        const targetClassShouldNotHaveSameMethodSignature = !this.similarLocalMethodInTargetClass(method, targetClass);
        const movedMethodShouldNotOverrideAbstractMethod = !this.abstractMethodsToBeOverridden(method.parent().first()).includes(method.data("properties.simpleName"));
        const movedMethodShouldNotBeAbstract = !this.abstract(method);
        const targetShouldNotBeInterface = !this.isInterface(targetClass);
        const movedMethodShouldNotCallSuper = true; // TODO: graph should contain information about method calls, but it currently does not. So we cannot check if the method calls super. This is a limitation of the current implementation.
        return targetClassShouldNotHaveSameMethodSignature && movedMethodShouldNotOverrideAbstractMethod && movedMethodShouldNotBeAbstract && targetShouldNotBeInterface && movedMethodShouldNotCallSuper;
    }

    private isBehaviourPreserving = (method: cytoscape.NodeSingular, targetClass: cytoscape.NodeSingular): boolean => {
        const targetClassShouldNotInheritMethodWithSameMethodSignature = !this.inheritedMethods(targetClass).toArray().some((inheritedMethod) => method.data("properties.simpleName") === inheritedMethod.data("properties.simpleName"));
        const movedMethodShouldNotOverrideInheritedMethod = !this.inheritedMethods(method.parent().first()).toArray().some((inheritedMethod) => method.data("properties.simpleName") === inheritedMethod.data("properties.simpleName"));
        const movedMethodShouldHaveReferenceToTargetClass = this.hasReferenceToTargetClass(method, targetClass);
        const movedMethodShouldNotBeSynchronized = true; // TODO: graph should contain information about whether a method is synchronized or not, but it currently does not. So we cannot check if the method is synchronized. This is a limitation of the current implementation.
        return targetClassShouldNotInheritMethodWithSameMethodSignature && movedMethodShouldNotOverrideInheritedMethod && movedMethodShouldHaveReferenceToTargetClass && movedMethodShouldNotBeSynchronized;
    }

    private passesQualityMeasures = (method: cytoscape.NodeSingular, targetClass: cytoscape.NodeSingular): boolean => {
        const noSourceFieldAssignments = !this.hasClassFieldAssignment(method);
        const hasOneToOneRelationship = this.oneToOneRelationship(method, targetClass);
        return noSourceFieldAssignments && hasOneToOneRelationship;
    }

    // Hacky fix. Graph should contain information about whether a method is abstract or not, but it currently does not. So we check the source text for the word "abstract" to determine if it is abstract.
    private abstract = (n: cytoscape.NodeSingular) => nodeHasKind(n, "method") && (n.data("properties.sourceText").includes("abstract") || this.isInterface(n.parent().first()))
    private fieldIsNotPrivate = (n: cytoscape.NodeSingular) => nodeHasKind(n, "field") && n.data("properties.visibility") !== "private";
    private isInterface = (n: cytoscape.NodeSingular) => n.data("properties.kind") === "interface"
    private hasParameterOfType = (method: cytoscape.NodeSingular, targetClass: cytoscape.NodeSingular): boolean => {
        return this.hasType(method, targetClass, 'parameterizes');
    };

    /**
     * 
     * @param n node you want to check the type of
     * @param targetClass the type you want to check against
     * @param edgeType how can we get from the node to the type? For example, a field node we can look at 'typed' edges, and for methods we look at 'parameterizes' or 'returns' edges.
     * @param checkArrayLike additional check to see if the type is contained in an array
     */
    private hasType = (n: cytoscape.NodeSingular, targetClass: cytoscape.NodeSingular, edgeType: string, checkArrayLike: boolean = false): boolean => {
        const edges = n.outgoers().edges().filter(e => edgeHasLabel(e, edgeType));
        for (const edge of edges) {
            if (edge.target().id() === targetClass.id()) {
                return checkArrayLike ? edge.data("properties.kind") === "array type" : true;
            }
        }
        return false;
    }

    private hasReferenceToTargetClass = (method: cytoscape.NodeSingular, targetClass: cytoscape.NodeSingular): boolean => {
        return this.hasParameterOfType(method, targetClass) || this.hasFieldOfType(method, targetClass);
    }

    private hasFieldOfType = (method: cytoscape.NodeSingular, targetClass: cytoscape.NodeSingular): boolean => {
        const fields = this.inheritedFields(method.parent().first()).union(method.parent().first().children().filter((child) => nodeHasKind(child, "field"))).nodes();
        return fields.toArray().some((field) => this.hasType(field, targetClass, "typed"));
    }

    private getSuperClass = (clasz: cytoscape.NodeSingular): cytoscape.NodeSingular | null => {
        const specializeEdges = clasz.outgoers().filter((e) => edgeHasLabel(e, "specializes")).edges()
        if (specializeEdges.length >= 2) {
            throw new Error(`Class ${clasz.data("name")} has multiple specialize edges. This is not supported.`);
        }

        if (specializeEdges.length === 0) {
            return null;
        }
        return specializeEdges.first().target();
    }

    private abstractMethodsToBeOverridden = (clasz: cytoscape.NodeSingular): string[] => {
        const superClass = this.getSuperClass(clasz);
        if (!superClass) { return []; }
        const abstractMethods = superClass.children().filter((child) => nodeHasKind(child, "method") && this.abstract(child)).map((method) => method.data("properties.simpleName"));
        return abstractMethods.concat(this.abstractMethodsToBeOverridden(superClass));
    }

    private inheritedFields = (clasz: cytoscape.NodeSingular): cytoscape.NodeCollection => {
        const superClass = this.getSuperClass(clasz);
        if (!superClass) { return this.cy.collection(); }
        const fields = superClass.children().filter((child) => nodeHasKind(child, "field") && this.fieldIsNotPrivate(child)).nodes()
        return fields.union(this.inheritedFields(superClass));
    }

    private inheritedMethods = (clasz: cytoscape.NodeSingular): cytoscape.NodeCollection => {
        const superClass = this.getSuperClass(clasz);
        if (!superClass) { return this.cy.collection(); }
        const methods = superClass.children().filter((child) => nodeHasKind(child, "method") && !this.abstract(child)).nodes()
        return methods.union(this.inheritedMethods(superClass));
    }

    private hasAssignment = (sourceText: string, variable: string ) => {
        return sourceText.includes(`${variable} =`) || sourceText.includes(`${variable}=`) || sourceText.includes(`--${variable}`) || sourceText.includes(`${variable}--`) || sourceText.includes(`++${variable}`) || sourceText.includes(`${variable}++`);
    }
    // Check if a method has an assignment to a field of the class it is in. This is a heuristic to check if the method is a setter or not. It is not perfect, but it is good enough for now.
    // Ideally the graph should contain more structured information about the method body
    private hasClassFieldAssignment = (method: cytoscape.NodeSingular) => {
        const fields = this.inheritedFields(method.parent().first()).union(method.parent().first().children().filter((child) => nodeHasKind(child, "field"))).nodes();
        const fieldNames = fields.map((field) => field.data("properties.simpleName"));
        method.outgoers().filter((e) => edgeHasLabel(e, 'uses')).forEach((edge) => {
            const variableName = edge.target().data("properties.simpleName");
            if (fieldNames.includes(variableName)) {
                if (this.hasAssignment(method.data("properties.sourceText"), variableName)) {
                    return true;
                }
            }
        })
        return false
    }

    private oneToOneRelationship = (method: cytoscape.NodeSingular, targetClass: cytoscape.NodeSingular): boolean => {
        // Graph should contain more information. It currently doesnt include typed edges to primitive types like array to check this.
        const fields = this.inheritedFields(method.parent().first()).union(method.parent().first().children().filter((child) => nodeHasKind(child, "field"))).nodes();
        const fieldWithOneToManyRelationshipExists = fields.toArray().some((field) => this.hasType(field, targetClass, "typed", true));
        const parameterWithOneToManyRelationshipExists = this.hasType(method, targetClass, 'parameterizes', true);
        return !fieldWithOneToManyRelationshipExists && !parameterWithOneToManyRelationshipExists;

    }

    private similarLocalMethodInTargetClass = (method: cytoscape.NodeSingular, targetClass: cytoscape.NodeSingular): boolean => {
        // Methods can have same name but different parameters, so this is not a perfect check. But it is a good enough heuristic for now.
        const targetMethods = targetClass.children().filter((child) => nodeHasKind(child, "method")).nodes();
        return targetMethods.toArray().some((targetMethod) => method.data("properties.simpleName") === targetMethod.data("properties.simpleName"));
    } 
}
