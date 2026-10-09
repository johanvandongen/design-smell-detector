import cytoscape from "cytoscape";
// @ts-ignore
import { nodeHasKind, edgeHasLabel } from '../utilities/utils.js';

export class ExtractInterfacetrategy {
    private targetClass: string;

    constructor(targetClass: string) {
        this.targetClass = targetClass
    }
    
    /** Applies the refactoring and returns the id of the node to focus zoom in on */
    apply(cynew: cytoscape.Core): string {
        const nodeToRefactor = cynew.getElementById(this.targetClass)
        nodeToRefactor.data("labels").push("Modified")
        const interfaceName = "I" + nodeToRefactor.data("label")
        cynew.add([
            {
                group: 'nodes',
                data: { id: interfaceName, label: interfaceName,  name: interfaceName, labels: ["Type", "New"], properties: { "type": "interface", "kind": "class", "simpleName": "Int" } },
            }, 
            {
                group: 'edges',
                data: { source: nodeToRefactor.id(), target: interfaceName, label: 'myInterface', labels: ["New"] },
            }
        ]);
        
        // Add original methods to interface
        const newInterface = cynew.getElementById(interfaceName)
        newInterface.move({ parent: nodeToRefactor.parent().first().id() });
        const originalClassMethods = nodeToRefactor.children().filter((child) => nodeHasKind(child, "method"));
        const newMethods = cynew.add(originalClassMethods.map((node) => 
            {
                const newId = interfaceName + node.id();
                const label = node.data("label")
                return {
                    group: 'nodes',
                    data: { id: newId, label: label,  name: label, labels: ["Operation", "New"], properties: { "kind": "method", "simpleName": label } },
                }
            }, 
        ));
        newMethods.move({parent: newInterface.id()});

        // Modify edges
        nodeToRefactor.incomers().forEach((edge) => {
            if (edge.source().id()) {
                if (edgeHasLabel(edge, "typed") || edgeHasLabel(edge, "returns") || edgeHasLabel(edge, "parameterizes")) {
                    cynew.add([
                        {
                            group: 'edges',
                            data: { source: edge.source().id(), target: interfaceName, label: edge.data("label"), labels: ["New"] },
                        }
                    ]);
                    edge.remove();
                }
            }
        })

        return newInterface.id()
    }
}
