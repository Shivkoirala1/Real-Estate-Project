export default function ManageAgents() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});

    const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllAgents({ page, limit: 10 });
        setAgents(data.agents ?? []);
        setPagination(data.pagination ?? { page: 1, totalPages: 1, total: 0 });
    } catch (err) {
      console.error("Failed to load agents:", err);
      setError("Failed to load agents. Please try again later.");
    } finally {
      setLoading(false);
    }
    }, [page]);

    useEffect(() => {
    fetchAgents();
    }
, [fetchAgents]);

    const goToPage = (p) => {
    if (p < 1 || p > pagination.totalPages) return;
    setPage(p);
    }

    return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold mb-4">Manage Agents</h1>
      {loading ? (
        <p>Loading agents...</p>
        ) : error ? (
        <p className="text-red-500">{error}</p>
        ) : (
        <div>
          <p className="text-gray-500">Showing {agents.length} of {pagination.total} agents</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <div key={agent.id} className="border rounded p-4">
                <h2 className="text-lg font-semibold">{agent.name}</h2>
                <p className="text-gray-500">{agent.email}</p>
              </div>
            ))}
          </div>
          {pagination.totalPages > 1 && (
            <div className="flex justify-center mt-4">
              <button
                onClick={() => goToPage(pagination.page - 1)}
                disabled={pagination.page === 1}
                className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
              >
                Previous
              </button>
              <span className="mx-2 self-center">
                {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => goToPage(pagination.page + 1)}
                disabled={pagination.page === pagination.totalPages}
                className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}