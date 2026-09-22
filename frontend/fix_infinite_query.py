import os

file_path = r"E:\WebSite\Blueprint_host\frontend\src\pages\InterviewHub\DSAEngine.jsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

target = """  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status
  } = useInfiniteQuery({
    queryKey: ['dsaProblems', company, topic, difficulty],
    queryFn: fetchProblems,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    staleTime: 5 * 60 * 1000,
  });"""

replacement = """  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status
  } = useInfiniteQuery({
    queryKey: ['dsaProblems', company, topic, difficulty],
    queryFn: fetchProblems,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    staleTime: 5 * 60 * 1000,
  });"""

content = content.replace(target, replacement)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("DSAEngine.jsx fixed successfully!")

file_path_vault = r"E:\WebSite\Blueprint_host\frontend\src\pages\Vault\VaultDashboard.jsx"

with open(file_path_vault, "r", encoding="utf-8") as f2:
    content_vault = f2.read()

target_vault = """  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage: loadingMore,
    status
  } = useInfiniteQuery({
    queryKey: ['vaultItems'],
    queryFn: fetchVaultItems,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    staleTime: 5 * 60 * 1000,
  });"""

replacement_vault = """  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage: loadingMore,
    status
  } = useInfiniteQuery({
    queryKey: ['vaultItems'],
    queryFn: fetchVaultItems,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    staleTime: 5 * 60 * 1000,
  });"""

content_vault = content_vault.replace(target_vault, replacement_vault)

with open(file_path_vault, "w", encoding="utf-8") as f2:
    f2.write(content_vault)

print("VaultDashboard.jsx fixed successfully!")
