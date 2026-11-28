import cytoscape from "cytoscape";
// @ts-ignore
import { edgeHasLabel } from '../utilities/utils.js';
import { DependencyInjectionSuggestion } from "./refactorEngine.js";
import { ExtractInterfaceTransformation } from "./extractInterfaceTransformation.js";
import { IRefactoringStrategy, RefactoringChangeSet } from "./IRefactoringStrategy.js";


export class DependencyInjectionStrategy implements IRefactoringStrategy<DependencyInjectionSuggestion> {
    
    /** 
     * @param cy a source of truth graph with all original edges and nodes which queryable
     * Applies the refactoring and returns a changeset 
     * */
    apply(cy: cytoscape.Core, suggestion: DependencyInjectionSuggestion): RefactoringChangeSet {
        
        const targetNode = cy.getElementById(suggestion.targetClass)
        const currentNode = cy.getElementById(suggestion.sourceClass) 
        const field = cy.getElementById(suggestion.fieldId)
        const typedEdges = field.outgoers().filter((e) => edgeHasLabel(e, "typed"))
        const fieldHasInterfaceType = typedEdges[0].target().data("labels").includes("interface")

        targetNode.data("labels").push("Modified")
        currentNode.data("labels").push("Modified")
        const newMethodId = "set" + field.data("name")
        const refactoringChangeSet: RefactoringChangeSet = {
            addedNodes: [], addedEdges: [], updatedNodes: [],
            removeEdgeIds: [], focus: currentNode.id(),
            removeNodeIds: [], removeEdges: [],
        };

        const composedHoldsEdgeRemoved = IRefactoringStrategy.removeEdge(refactoringChangeSet, typedEdges.edges().first()) === 1;

        // Add setter method
        refactoringChangeSet.addedNodes.push({
            id: newMethodId,
            label: newMethodId, labels: ["New", "Operation"],
            parent: currentNode.id(),
            name: newMethodId,
            properties: {
                name: newMethodId,
                shortname: newMethodId,
                simpleName: newMethodId,
                kind: "method",
                sourceText: undefined,
                visibility: "public"
            }
        })
        refactoringChangeSet.updatedNodes.push({id: suggestion.fieldId, newLabel: "Modified"})
        refactoringChangeSet.focus = newMethodId

        
        // Modify edges
        const instantiatesEdges = field.outgoers().edges().filter((e) => edgeHasLabel(e, "instantiates"))
        IRefactoringStrategy.removeEdge(refactoringChangeSet, instantiatesEdges.edges().first())

        const setMethodNewParameterizesEdge = {
            interaction: "parameterizes",
            group: "edges",
            label: "parameterizes",
            labels: ["New"],
            source: newMethodId,
            sourceClass: currentNode.id(),
            target: typedEdges[0].target().id(),
            targetClass: typedEdges[0].target().id()
        }
        const e = setMethodNewParameterizesEdge //shorthand

        if (fieldHasInterfaceType) {
            // refactoringChangeSet.addedEdges.push(setMethodNewParameterizesEdge)
            IRefactoringStrategy.addEdgeInteraction(cy, refactoringChangeSet, e.interaction, e.source, e.sourceClass, e.target, e.targetClass)
            return refactoringChangeSet 
        }

        // Field has no interface type so add extract interface
        const {changeSet: extractInterfaceChangeSet, interfaceId} = ExtractInterfaceTransformation.apply(cy, {
            kind: "extract-interface",
            sourceClass: suggestion.sourceClass,
            targetClass: suggestion.targetClass,
            description: ""
        })


        IRefactoringStrategy.addEdgeInteraction(cy, refactoringChangeSet, e.interaction, e.source, e.sourceClass, e.target, interfaceId)

        // Merge all changes from extract interface
        refactoringChangeSet.addedNodes = extractInterfaceChangeSet.addedNodes.concat(refactoringChangeSet.addedNodes)
        refactoringChangeSet.addedEdges.push(...(composedHoldsEdgeRemoved ? extractInterfaceChangeSet.addedEdges.filter((e) => !(e.interaction === "holds" && e.source === currentNode.id() && e.target === interfaceId)) : extractInterfaceChangeSet.addedEdges))
        refactoringChangeSet.removeEdgeIds.push(...extractInterfaceChangeSet.removeEdgeIds)
        refactoringChangeSet.updatedNodes.push(...extractInterfaceChangeSet.updatedNodes)
        refactoringChangeSet.focus = interfaceId;

        return refactoringChangeSet
    }
}
