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
            removeEdgeIds: [], focus: currentNode.id()
        };

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
        const instantiatesEdges = field.outgoers().filter((e) => edgeHasLabel(e, "insstantiates"))
        refactoringChangeSet.removeEdgeIds.push(instantiatesEdges.first().id())

        const setMethodNewParameterizesEdge = {
            interaction: "parameterizes",
            group: "edges",
            label: "parameterizes",
            labels: ["New"],
            source: newMethodId,
            target: typedEdges[0].target().id()
        }

        if (fieldHasInterfaceType) {
            refactoringChangeSet.addedEdges.push(setMethodNewParameterizesEdge)
            return refactoringChangeSet
        }

        // Field has no interface type so add extract interface
        const {changeSet: extractInterfaceChangeSet, interfaceId} = ExtractInterfaceTransformation.apply(cy, {
                kind: "extract-interface",
                sourceClass: suggestion.sourceClass,
                targetClass: suggestion.targetClass,
                description: ""
            })

        refactoringChangeSet.addedEdges.push({...setMethodNewParameterizesEdge, target: interfaceId})

        // Merge all changes from extract interface
        refactoringChangeSet.addedNodes = extractInterfaceChangeSet.addedNodes.concat(refactoringChangeSet.addedNodes)
        refactoringChangeSet.addedEdges.push(...extractInterfaceChangeSet.addedEdges)
        refactoringChangeSet.removeEdgeIds.push(...extractInterfaceChangeSet.removeEdgeIds)
        refactoringChangeSet.updatedNodes.push(...extractInterfaceChangeSet.updatedNodes)

        return refactoringChangeSet
    }
}
