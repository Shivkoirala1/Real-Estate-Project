import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react';

// ------------------------------------------------------------------
// LeadContext - shared state for the Lead Management dashboard so the
// kanban board, list view, and stats bar stay in sync while switching
// tabs/filters without refetching everything.
// ------------------------------------------------------------------

const LeadContext = createContext(null);

const initialState = {
  leads: [],
  selectedLead: null,
  metrics: null,
  filters: {
    stage: null,
    assignedAgent: null,
    priority: null,
    source: null,
    search: '',
    nextFollowUp: null,
  },
  loading: false,
  error: null,
};

const leadReducer = (state, action) => {
  switch (action.type) {
    case 'FETCH_LEADS_START':
      return { ...state, loading: true, error: null };
    case 'FETCH_LEADS_SUCCESS':
      return { ...state, leads: action.payload, loading: false };
    case 'FETCH_LEADS_ERROR':
      return { ...state, error: action.payload, loading: false };
    case 'SET_METRICS':
      return { ...state, metrics: action.payload };
    case 'SELECT_LEAD':
      return { ...state, selectedLead: action.payload };
    case 'UPDATE_LEAD':
      return {
        ...state,
        leads: state.leads.map((l) => (l._id === action.payload._id ? action.payload : l)),
        selectedLead:
          state.selectedLead && state.selectedLead._id === action.payload._id
            ? action.payload
            : state.selectedLead,
      };
    case 'REMOVE_LEAD':
      return {
        ...state,
        leads: state.leads.filter((l) => l._id !== action.payload),
        selectedLead:
          state.selectedLead && state.selectedLead._id === action.payload ? null : state.selectedLead,
      };
    case 'SET_FILTERS':
      return { ...state, filters: { ...state.filters, ...action.payload } };
    case 'RESET_FILTERS':
      return { ...state, filters: initialState.filters };
    default:
      return state;
  }
};

export const LeadProvider = ({ children }) => {
  const [state, dispatch] = useReducer(leadReducer, initialState);

  const setFilters = useCallback(
    (payload) => dispatch({ type: 'SET_FILTERS', payload }),
    []
  );
  const resetFilters = useCallback(() => dispatch({ type: 'RESET_FILTERS' }), []);
  const updateLead = useCallback(
    (payload) => dispatch({ type: 'UPDATE_LEAD', payload }),
    []
  );
  const removeLead = useCallback(
    (payload) => dispatch({ type: 'REMOVE_LEAD', payload }),
    []
  );

  const value = useMemo(
    () => ({ state, dispatch, setFilters, resetFilters, updateLead, removeLead }),
    [state, setFilters, resetFilters, updateLead, removeLead]
  );

  return <LeadContext.Provider value={value}>{children}</LeadContext.Provider>;
};

export const useLeads = () => {
  const ctx = useContext(LeadContext);
  if (!ctx) {
    throw new Error('useLeads must be used within a LeadProvider');
  }
  return ctx;
};
