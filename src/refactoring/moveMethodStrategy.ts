import cytoscape from "cytoscape";
// @ts-ignore
import { edgeHasLabel, nodeHasKind } from '../utilities/utils.js';
import { IRefactoringStrategy, RefactoringChangeSet } from "./IRefactoringStrategy.js";
import { MoveMethodSuggestion } from "./moveMethodDetector.js";
import { composedEdgesMap } from "../graphPreProcessing/graphPreprocessor.js";


export class MoveMethodStrategy implements IRefactoringStrategy<MoveMethodSuggestion> {
    
    /** 
     * @param cy a source of truth graph with all original edges and nodes which queryable
     * Applies the refactoring and returns a changeset 
     * */
    apply(cy: cytoscape.Core, suggestion: MoveMethodSuggestion): RefactoringChangeSet {
        const targetClass = cy.getElementById(suggestion.targetClass)
        const sourceClass = cy.getElementById(suggestion.sourceClass) 
        const method = cy.getElementById(suggestion.methodId)
        const refactoringChangeSet: RefactoringChangeSet = {
            addedNodes: [], addedEdges: [], updatedNodes: [],
            removeEdgeIds: [], focus: method.id(),
            removeNodeIds: [], description: "", removeEdges: [],
        };

        const methodNewId = targetClass.data("id") + method.data("properties.simpleName")
        refactoringChangeSet.removeNodeIds.push(method.id())
        refactoringChangeSet.addedNodes.push({
            id: methodNewId,
            label: method.data("label"), 
            labels: ["New", "Operation"],
            parent: targetClass.id(),
            name: method.data("name"),
            properties: {
                name: method.data("name"),
                shortname: method.data("shortname"),
                simpleName: method.data("simpleName"),
                kind: "method",
                sourceText: method.data("sourceText"),
                visibility: "public"
            }
        })
        
        
        // Add dependency edges to new method
        const interactions_removed: [string, string][] = []
        method.outgoers().forEach((edge) => {
            if (edgeHasLabel(edge, "returns") || edgeHasLabel(edge, "parameterizes") || edgeHasLabel(edge, "invokes") || edgeHasLabel(edge, "instantiates")) {
                const targetParent = edge.target().data("properties.kind") === "method" ? edge.target().parent().first().id() : edge.target().id()
                IRefactoringStrategy.addEdge(cy, refactoringChangeSet, edge, methodNewId, targetClass.id(), edge.target().id(), targetParent)
                interactions_removed.push([edge.data("interaction"), edge.target().data("properties.kind") === "method" ? edge.target().parent().first().id() : edge.target().id()]) // direct edge automatically removed by removing method node
            }
        })

        // Remove self parameterizes edge once. 
        // We moved method to target class and added all the original edges to that, but the new self parameterize edge
        // is not needed, since we already have access to that object. A.method(b) becomes B.method(a)
        // (remove it once since original method can have multiple parameters of type targetclass)
        for (let i =0; i <refactoringChangeSet.addedEdges.length; i++) {
            const e = refactoringChangeSet.addedEdges[i]
            if (e.interaction === "parameterizes" && e.target === targetClass.id()) {
                refactoringChangeSet.addedEdges.splice(i, 1)
                break;
            }
        }

        IRefactoringStrategy.addEdgeInteraction(cy, refactoringChangeSet, "parameterizes", methodNewId, targetClass.id(), sourceClass.id(), sourceClass.id())
        
        // Update composed edges between source class and target class
        const sourceClassOtherMethods = sourceClass.children().filter((child) => nodeHasKind(child, "method") && child.id() !== method.id());
        interactions_removed.forEach(([interaction, target]) => {
            const interactionStillExists = sourceClassOtherMethods.outgoers().edges().filter((e) => edgeHasLabel(e, interaction) && target === e.target().id()).length > 0
            
            const removeDescription = (interaction: string) => `Removed ${sourceClass.data("properties.simpleName")} ${interaction} ${cy.getElementById(target).data("properties.simpleName")}`
            if (interactionStillExists) {
                refactoringChangeSet.description += removeDescription(interaction) +  ` but composed edge (${composedEdgesMap[interaction]}) still exists due to other methods \n`
            } else {
                const composedEdgeId = sourceClass.outgoers().edges().filter((e) => edgeHasLabel(e,composedEdgesMap[interaction]) && e.target().id() === target).edges().first();
                if (composedEdgeId.length === 0) {
                    // Happens when composed edge doesnt exist (either due to incorrect state, or self loop)
                    return;
                }
                refactoringChangeSet.removeEdgeIds.push(composedEdgeId.id())
                IRefactoringStrategy.removeEdge(refactoringChangeSet, composedEdgeId)
                // refactoringChangeSet.description += removeDescription(composedEdgesMap[interaction]) + "\n"
            }
        })

        method.incomers().edges().filter((e) => edgeHasLabel(e, "invokes")).forEach((edge) => {
            refactoringChangeSet.updatedNodes.push({id: edge.source().id(), newLabel: "Modified"})
            if (suggestion.newMethodReference === 'parameter') {
                refactoringChangeSet.addedEdges.push({
                    interaction: "invokes",
                    group: "edges",
                    label: "invokes",
                    source: edge.source().id(),
                    target: methodNewId
                })
            } else if (suggestion.newMethodReference === 'field') {
                console.warn("TODO field reference")
                // 'uses' edges not supported in json input model, so left out of scope for now
                // Add edges from edge.source() to sourceClass fields
                // const sourceField = 'some source field of type target class'
                // refactoringChangeSet.addedEdges.push({
                //     interaction: "uses",
                //     group: "edges",
                //     label: "invokes",
                //     source: edge.source().id(),
                //     target: sourceField
                // })
            }
        })

        return refactoringChangeSet
    }
}
