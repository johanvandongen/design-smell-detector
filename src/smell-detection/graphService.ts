export class GraphService {
    // Used https://www.geeksforgeeks.org/dsa/strongly-connected-components/ for strongly connected components algorithm (Kosaraju's algorithm)
    private static DFS1(u: number, adj: { [key: number]: number[] }, visited: boolean[], st: number[]) {
        visited[u] = true;
        for (let v of adj[u]) {
            if (!visited[v]) this.DFS1(v, adj, visited, st);
        }
        st.push(u);
    }

    // DFS on reversed graph to collect SCC
    private static DFS2(u: number, revAdj: { [key: number]: number[] }, visited: boolean[], scc: number[]) {
        visited[u] = true;
        scc.push(u);
        for (let v of revAdj[u]) {
            if (!visited[v]) this.DFS2(v, revAdj, visited, scc);
        }
    }

    private static kosaraju(number_of_nodes: number, adj: { [key: number]: number[] }): number[][] {
        let visited = Array(number_of_nodes).fill(false);
        let st: number[] = [];

        // Fill stack with finish time order
        for (let i = 0; i < number_of_nodes; i++) {
            if (!visited[i]) this.DFS1(i, adj, visited, st);
        }

        // Reverse the graph
        let revAdj: { [key: number]: number[] } = Array.from({ length: number_of_nodes }, () => []);
        for (let u: number = 0; u < number_of_nodes; u++) {
            for (let v of adj[u]) {
                revAdj[v].push(u);
            }
        }

        // Process reversed graph in order of stack
        visited.fill(false);
        let SCCs: number[][] = [];

        while (st.length > 0) {
            let u: number | undefined = st.pop();
            if (u && !visited[u]) {
                let scc: number[] = [];
                this.DFS2(u, revAdj, visited, scc);
                SCCs.push(scc);
            }
        }

        return SCCs;
    }

    public static createAdjacencyList(number_of_nodes: number, edges: [number, number][]): { [key: number]: number[] } {
        let adj: { [key: number]: number[] } = Array.from({ length: number_of_nodes }, () => []);
        for (let [u, v] of edges) {
            adj[u].push(v);
        }
        return adj;
    }

    /** Nodes (and thus edges!) must start from index 1 and be sequential */
    public static getStronglyConnectedComponents(number_of_nodes: number, edges: [number, number][]): number[][] {
        const adj = this.createAdjacencyList(number_of_nodes + 1, edges);
        const SCCs = this.kosaraju(number_of_nodes + 1, adj);
        
        console.log("Strongly Connected Components:");
        const result = []
        for (let i = 0; i < SCCs.length - 1; i++) {
            if (SCCs[i].length > 1) {
                result.push(SCCs[i]);
                console.log(SCCs[i].join(" "));
            }
        }
        return result;
    }
};
