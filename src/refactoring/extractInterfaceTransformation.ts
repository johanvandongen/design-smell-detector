import cytoscape from "cytoscape";
// @ts-ignore
import { nodeHasKind, edgeHasLabel } from '../utilities/utils.js';
import { ExtractInterfaceSuggestion } from "./refactorEngine.js";
import { IRefactoringStrategy, RefactoringChangeSet } from "./IRefactoringStrategy.js";
import { edgeIsComposed } from "../graphPreProcessing/graphPreprocessor.js";

export class ExtractInterfaceTransformation {

    static addEdge(changeSet: RefactoringChangeSet, edge: cytoscape.EdgeSingular, sourceParent: string, targetParent: string, source?: string) {
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
            "returns": "produces",
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
        if (!changeSet.addedEdges.some((e) => e.id === newEdgeId) && sourceParent !== targetParent) {
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

        const newInterfaceId = "I" + targetNode.data("label")
        
        const refactoringChangeSet: RefactoringChangeSet = {
            addedNodes: [], addedEdges: [], updatedNodes: [],
            removeEdgeIds: [], focus: newInterfaceId,
            removeNodeIds: [], removeEdges: [],
        };

        refactoringChangeSet.addedNodes.push({
            parent: targetNode.parent().first().id(), 
            id: newInterfaceId, 
            label: newInterfaceId,  
            name: newInterfaceId, 
            labels: ["Type", "New"], 
            properties: {
                type: "interface",
                kind: "interface",
                simpleName: newInterfaceId,
                shortname: newInterfaceId,
                name: newInterfaceId
            }})
        refactoringChangeSet.addedEdges.push({
            source: targetNode.id(), target: newInterfaceId, label: 'specializes', labels: ["New"],
            interaction: "",
            group: "edges"
        })
        refactoringChangeSet.description = `Added interface ${newInterfaceId}`
        
        const getClass = (n: cytoscape.NodeSingular) => n.data("labels").includes("Type") ? n : n.parent().first();
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
                        IRefactoringStrategy.addEdge(cy, refactoringChangeSet, edge, method.id(), targetNode.id(), newInterfaceId, newInterfaceId)
                        IRefactoringStrategy.removeEdge(refactoringChangeSet, edge)
                    } else {
                        IRefactoringStrategy.addEdge(cy, refactoringChangeSet, edge, newMethodId, newInterfaceId, edge.target().id(), getClass(edge.target()).id())
                    }
                })
                method.incomers().filter((edge) => edgeHasLabel(edge, "invokes")).forEach((edge) => {
                    IRefactoringStrategy.addEdge(cy, refactoringChangeSet, edge, edge.source().id(), getClass(edge.source()).id(), newMethodId, newInterfaceId)
                    IRefactoringStrategy.removeEdge(refactoringChangeSet, edge)
                })
            });


        // Redirect incoming edges to interface
        targetNode.incomers().edges().forEach((edge) => {
            if (edgeHasLabel(edge, "typed") || edgeHasLabel(edge, "returns") || edgeHasLabel(edge, "parameterizes") || edgeHasLabel(edge, "invokes") || edgeHasLabel(edge, 'instantiates')) {
                IRefactoringStrategy.addEdge(cy, refactoringChangeSet, edge, edge.source().id(), getClass(edge.source()).id(), newInterfaceId, newInterfaceId)
                refactoringChangeSet.updatedNodes.push({id: edge.source().id(), newLabel: "Modified"})
                refactoringChangeSet.updatedNodes.push({id: edge.target().id(), newLabel: "Modified"})
                refactoringChangeSet.removeEdgeIds.push(edge.id());
                IRefactoringStrategy.removeEdge(refactoringChangeSet, edge)
            }
        })
        // Update composed edges
        // targetNode.incomers().edges().forEach((edge) => {
        //     if (edgeIsComposed(edge)) {
        //         IRefactoringStrategy.addEdgeInteraction(cy, refactoringChangeSet, edge.data('interaction'), edge.source().id(), edge.source().id(), newInterfaceId, newInterfaceId)
        //         IRefactoringStrategy.removeEdge(refactoringChangeSet, edge)
        //     }
        // })
        const removeComposedEdges = cy.edges().filter((e) => e.target().id() === targetNode.id() && (edgeHasLabel(e, "accepts") || edgeHasLabel(e, "holds") || edgeHasLabel(e, "produces") || edgeHasLabel(e, "calls"))).map((e) => e.id())
        refactoringChangeSet.removeEdgeIds.push(...removeComposedEdges)

        return {changeSet: refactoringChangeSet, interfaceId: newInterfaceId}
    }
}
