import cytoscape from "cytoscape";
// @ts-ignore
import { nodeHasKind, edgeHasLabel } from '../utilities/utils.js';
import { ExtractInterfaceSuggestion } from "./refactorEngine.js";
import { RefactoringChangeSet } from "./IRefactoringStrategy.js";

export class ExtractInterfaceTransformation {

    static addEdge(changeSet: RefactoringChangeSet, edge: cytoscape.SingularElementReturnValue, sourceParent: string, targetParent: string, source?: string) {
        if (source) {
            changeSet.addedEdges.push({
                interaction: edge.data("interaction"),
                group: "edges",
                label: edge.data("label"),
                source: source,
                target: targetParent
            })
        }

        const interactions: { [key: string]: string } = {
            "returns": "returns(cls)",
            "parameterizes": "accepts",
            "typed": "holds",
            "invokes": "calls"
        }

        const interaction:string = edge.data("interaction")
        if (!Object.hasOwn(interactions, interaction)) {
            throw Error ("unknown interaction")
        }
        const classLevelInteraction: string = interactions[interaction]
        const newEdgeId = sourceParent + "-" + classLevelInteraction + "-" + targetParent;
        if (!changeSet.addedEdges.some((e) => e.id === newEdgeId)) {
            changeSet.addedEdges.push({
                id: newEdgeId,
                interaction: classLevelInteraction,
                group: "edges",
                label: classLevelInteraction,
                source: sourceParent,
                target: targetParent
            })
        }
    }
    
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
            source: targetNode.id(), target: newInterfaceId, label: 'specializes', labels: ["New"],
            interaction: "",
            group: "edges"
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
                    if (edge.target().id() === targetNode.id()) {
                        this.addEdge(refactoringChangeSet, edge, newInterfaceId, newInterfaceId, newMethodId)
                    } else {
                        this.addEdge(refactoringChangeSet, edge, newInterfaceId, edge.target().id(), newMethodId)
                    }
                })
            });

        // Redirect incoming edges to interface
        targetNode.incomers().forEach((edge) => {
            if (edge.source().id()) {
                if (edgeHasLabel(edge, "typed") || edgeHasLabel(edge, "returns") || edgeHasLabel(edge, "parameterizes") || edgeHasLabel(edge, "invokes")) {
                    this.addEdge(refactoringChangeSet, edge, edge.source().parent().first().id(), newInterfaceId, edge.source().id())
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
        const removeComposedEdges = cy.edges().filter((e) => e.target().id() === targetNode.id() && (edgeHasLabel(e, "accepts") || edgeHasLabel(e, "holds") || edgeHasLabel(e, "returns(cls)") || edgeHasLabel(e, "calls"))).map((e) => e.id())
        refactoringChangeSet.removeEdgeIds.push(...removeComposedEdges)

        return {changeSet: refactoringChangeSet, interfaceId: newInterfaceId}
    }
}
