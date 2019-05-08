export const state = () => ({
  transactions: []
})

export const getters = {
  transactions: state => state.transactions,
}

export const mutations = {
  setTransactions(state, transactions) {
    state.transactions = transactions
  }
}

export const actions = {
  async setTransactions({ state, commit }, transactions) {
    commit('setTransactions', transactions)
  },
}