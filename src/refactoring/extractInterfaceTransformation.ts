import cytoscape from "cytoscape";
// @ts-ignore
import { nodeHasKind, edgeHasLabel } from '../utilities/utils.js';
import { ExtractInterfaceSuggestion } from "./refactorEngine.js";
import { RefactoringChangeSet } from "./IRefactoringStrategy.js";

export class ExtractInterfaceTransformation {

    static apply(cy: cytoscape.Core, suggestion: ExtractInterfaceSuggestion): {changeSet: RefactoringChangeSet, interfaceId: string} {
        
        const targetNode = cy.getElementById(suggestion.targetClass) // target node is the class which we want an interface for
        targetNode.data("labels").push("Modified")

        const newInterfaceId = "I" + targetNode.data("label") + "<<Interface>>"
        
        const refactoringChangeSet: RefactoringChangeSet = {
            addedNodes: [], addedEdges: [], updatedNodes: [],
            removeEdgeIds: [], focus: newInterfaceId
        };

        refactoringChangeSet.addedNodes.push({parent: targetNode.parent().first().id(), id: newInterfaceId, label: newInterfaceId,  name: newInterfaceId, labels: ["Type", "New"], properties: { "type": "interface", "kind": "class", "simpleName": "Int", "name": "name", "shortname": "name"}})
        refactoringChangeSet.addedEdges.push({
            source: targetNode.id(), target: newInterfaceId, label: 'myInterface', labels: ["New"],
            interaction: "",
            group: ""
        })
        
        // Add original methods to interface
        const originalClassMethods = targetNode.children().filter((child) => nodeHasKind(child, "method"));
        originalClassMethods.forEach((method) => 
            {
                const newMethodId = newInterfaceId + method.id();
                const label = method.data("label")
                refactoringChangeSet.addedNodes.push({ parent: newInterfaceId, id: newMethodId, label: label,  name: label, labels: ["Operation", "New"], properties: {
                    "kind": "method", "simpleName": label,
                    name: "",
                    shortname: ""
                } })
                
                method.outgoers().filter((edge) => edgeHasLabel(edge, "returns") || edgeHasLabel(edge, "parameterizes")).forEach((edge) => {
                refactoringChangeSet.addedEdges.push({
                    interaction: edge.data("interaction"),
                    group: "edges",
                    label: edge.data("label"),
                    source: newMethodId,
                    target: edge.target().id()
                })
            })
            });

        // Redirect incoming edges to interface
        targetNode.incomers().forEach((edge) => {
            if (edge.source().id()) {
                if (edgeHasLabel(edge, "typed") || edgeHasLabel(edge, "returns") || edgeHasLabel(edge, "parameterizes")) {
                    refactoringChangeSet.addedEdges.push({
                        source: edge.source().id(), target: newInterfaceId, label: edge.data("label"), labels: ["New"],
                        interaction: edge.data("interaction"),
                        group: ""
                    })
                    refactoringChangeSet.updatedNodes.push({
                        id: edge.source().id(),
                        newLabel: "Modified"
                    })
                    refactoringChangeSet.updatedNodes.push({
                        id: edge.target().id(),
                        newLabel: "Modified"
                    })
                    refactoringChangeSet.removeEdgeIds.push(edge.id());
                }
            }
        })
        originalClassMethods.forEach((method) => {
           

        })

        return {changeSet: refactoringChangeSet, interfaceId: newInterfaceId}
    }
}
