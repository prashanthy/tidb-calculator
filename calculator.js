<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TiDB Migration Calculator</title>
  
  <!-- Load React -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"></script>
  
  <!-- Load Recharts -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/recharts/2.5.0/Recharts.min.js"></script>
  
  <!-- Load Tailwind CSS -->
  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
  
  <style>
    /* Additional custom styles if needed */
    .chart-container {
      height: 300px;
    }
  </style>
</head>
<body class="bg-gray-100">
  <div id="root" class="container mx-auto py-8"></div>

  <script>
    // Access React and ReactDOM from global scope
    const { useState, useEffect } = React;
    const { createRoot } = ReactDOM;
    
    // Access Recharts components from global scope
    const { 
      BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
      ResponsiveContainer, LineChart, Line 
    } = Recharts;

    // EC2 instance types and pricing (approximate monthly costs)
    const ec2InstanceTypes = {
      // Compute-optimized (good for TiDB)
      "c5.2xlarge": { vCPU: 8, memory: 16, monthlyCost: 246, description: "Good for TiDB servers" },
      "c5.4xlarge": { vCPU: 16, memory: 32, monthlyCost: 493, description: "Recommended for TiDB servers" },
      "c5.9xlarge": { vCPU: 36, memory: 72, monthlyCost: 1109, description: "High performance TiDB" },
      
      // Memory-optimized (good for high memory workloads)
      "r5.2xlarge": { vCPU: 8, memory: 64, monthlyCost: 387, description: "Memory optimized" },
      "r5.4xlarge": { vCPU: 16, memory: 128, monthlyCost: 774, description: "High memory" },
      "r5.8xlarge": { vCPU: 32, memory: 256, monthlyCost: 1548, description: "Very high memory" },
      
      // General purpose (good for PD)
      "m5.2xlarge": { vCPU: 8, memory: 32, monthlyCost: 278, description: "Good for PD nodes" },
      "m5.4xlarge": { vCPU: 16, memory: 64, monthlyCost: 556, description: "High performance PD" },
      
      // Storage optimized with NVMe (best for TiKV)
      "i3.2xlarge": { vCPU: 8, memory: 61, monthlyCost: 499, nvme: 1900, description: "Recommended for TiKV" },
      "i3.4xlarge": { vCPU: 16, memory: 122, monthlyCost: 998, nvme: 3800, description: "High performance TiKV" },
      "i3.8xlarge": { vCPU: 32, memory: 244, monthlyCost: 1995, nvme: 7600, description: "Very high performance TiKV" },
      "i3en.2xlarge": { vCPU: 8, memory: 64, monthlyCost: 623, nvme: 5000, description: "Storage optimized TiKV" },
      "i3en.3xlarge": { vCPU: 12, memory: 96, monthlyCost: 935, nvme: 7500, description: "Storage optimized TiKV+" }
    };

    // EBS volume types and pricing
    const ebsVolumeTypes = {
      "gp3": { basePrice: 0.08, throughputPrice: 0.04, iopsPrice: 0.005 }, // per GB-month
      "gp2": { basePrice: 0.10 }, // per GB-month
      "io1": { basePrice: 0.125, iopsPrice: 0.065 }, // per GB-month, per provisioned IOPS-month
      "io2": { basePrice: 0.125, iopsPrice: 0.065 } // per GB-month, per provisioned IOPS-month
    };

    // PostgreSQL instance types and pricing (approximate monthly costs)
    const postgresInstanceTypes = {
      "db.m5.large": { vCPU: 2, memory: 8, monthlyCost: 218 },
      "db.m5.xlarge": { vCPU: 4, memory: 16, monthlyCost: 437 },
      "db.m5.2xlarge": { vCPU: 8, memory: 32, monthlyCost: 874 },
      "db.r5.large": { vCPU: 2, memory: 16, monthlyCost: 276 },
      "db.r5.xlarge": { vCPU: 4, memory: 32, monthlyCost: 552 },
      "db.r5.2xlarge": { vCPU: 8, memory: 64, monthlyCost: 1104 },
      "db.r5.4xlarge": { vCPU: 16, memory: 128, monthlyCost: 2208 }
    };

    // Main component
    const TiDBMigrationCalculator = () => {
      // State for PostgreSQL inputs
      const [postgres, setPostgres] = useState({
        instanceType: 'db.r5.2xlarge',
        instanceCount: 2,
        storageGB: 1000,
        iops: 3000,
        readOps: 5000,
        writeOps: 1000,
        monthlyCost: 2208 * 2, // Default to match instance cost
        multiAZ: true,
        readReplicas: 1
      });

      // State for workload characteristics
      const [workload, setWorkload] = useState({
        readWriteRatio: '80/20',
        type: 'OLTP', // OLTP, OLAP, Mixed
        dataGrowthRate: 10, // percentage per month
        concurrentConnections: 200,
        trafficSpikes: true,
        peakRatio: 3 // peak to normal ratio
      });

      // State for TiDB cluster configuration
      const [tidbCluster, setTidbCluster] = useState({
        tidbNodes: 3,
        tikvNodes: 3,
        pdNodes: 3,
        tiflashNodes: 0,
        useTiflash: false,
        eksClusterCount: 1, // Number of EKS clusters
        k8sWorkerNodes: 6, // Number of Kubernetes worker nodes
        availabilityZones: 3,
        dataReplicationFactor: 3 // Default replication factor
      });

      // State for EC2 instance selections
      const [instances, setInstances] = useState({
        tidbInstanceType: 'c5.4xlarge',
        tikvInstanceType: 'i3.4xlarge',
        pdInstanceType: 'm5.4xlarge',
        tiflashInstanceType: 'i3.8xlarge',
        monitoringInstanceType: 'c5.2xlarge'
      });

      // State for storage configuration
      const [storage, setStorage] = useState({
        tidbEbsType: 'gp3',
        tidbEbsSize: 100,
        tikvUseInstanceStore: true,
        tikvAdditionalEbsType: 'gp3',
        tikvAdditionalEbsSize: 0,
        pdEbsType: 'gp3',
        pdEbsSize: 100,
        tiflashEbsType: 'gp3',
        tiflashEbsSize: 1000
      });

      // State for operational costs
      const [operational, setOperational] = useState({
        backupToS3: true,
        backupSizeGB: 1000,
        networkTrafficGB: 5000,
        eksClusterCost: 73, // USD per month per cluster
        eksMonitoringCost: 200, // Additional EKS monitoring tools
        migrationCost: 5000, // One-time cost
        operationalFTE: 0.5 // Full-time equivalent staff
      });

      // State for comparison data to track changes in TiDB config based on PostgreSQL changes
      const [comparisonData, setComparisonData] = useState({
        previousInstanceType: postgres.instanceType,
        history: [],
        costBreakdown: []
      });

      // State for active tab
      const [activeTab, setActiveTab] = useState('calculator');

      // Handler for PostgreSQL input changes
      const handlePostgresChange = (e) => {
        const { name, value, type, checked } = e.target;
        
        // If changing the instance type, update the monthly cost with the default cost for that instance type
        if (name === 'instanceType') {
          const instanceCost = postgresInstanceTypes[value]?.monthlyCost || 0;
          setPostgres(prev => ({
            ...prev,
            [name]: value,
            monthlyCost: instanceCost * prev.instanceCount * (prev.multiAZ ? 2 : 1) + 
                        (instanceCost * prev.readReplicas)
          }));
        } else if (name === 'instanceCount' || name === 'readReplicas' || name === 'multiAZ') {
          // Recalculate costs if changing instance count, replicas, or multi-AZ
          const instanceCost = postgresInstanceTypes[postgres.instanceType]?.monthlyCost || 0;
          const newInstanceCount = name === 'instanceCount' ? Number(value) : postgres.instanceCount;
          const newMultiAZ = name === 'multiAZ' ? checked : postgres.multiAZ;
          const newReadReplicas = name === 'readReplicas' ? Number(value) : postgres.readReplicas;
          
          setPostgres(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : (type === 'number' ? Number(value) : value),
            monthlyCost: instanceCost * newInstanceCount * (newMultiAZ ? 2 : 1) + 
                        (instanceCost * newReadReplicas)
          }));
        } else {
          setPostgres(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : (type === 'number' ? Number(value) : value)
          }));
        }
      };

      // Handler for workload input changes
      const handleWorkloadChange = (e) => {
        const { name, value, type, checked } = e.target;
        setWorkload(prev => ({
          ...prev,
          [name]: type === 'checkbox' ? checked : (type === 'number' ? Number(value) : value)
        }));
      };

      // Handler for TiDB cluster input changes
      const handleTidbClusterChange = (e) => {
        const { name, value, type, checked } = e.target;
        setTidbCluster(prev => ({
          ...prev,
          [name]: type === 'checkbox' ? checked : (type === 'number' ? Number(value) : value)
        }));
      };

      // Handler for EC2 instance input changes
      const handleInstanceChange = (e) => {
        const { name, value } = e.target;
        setInstances(prev => ({
          ...prev,
          [name]: value
        }));
      };

      // Handler for storage input changes
      const handleStorageChange = (e) => {
        const { name, value, type, checked } = e.target;
        setStorage(prev => ({
          ...prev,
          [name]: type === 'checkbox' ? checked : (type === 'number' ? Number(value) : value)
        }));
      };

      // Handler for operational input changes
      const handleOperationalChange = (e) => {
        const { name, value, type, checked } = e.target;
        setOperational(prev => ({
          ...prev,
          [name]: type === 'checkbox' ? checked : (type === 'number' ? Number(value) : value)
        }));
      };

      // Auto-calculate TiDB resources based on PostgreSQL specs
      useEffect(() => {
        // Calculate PostgreSQL processing power (vCPU × instances)
        const postgresVcpu = postgresInstanceTypes[postgres.instanceType]?.vCPU || 8;
        const postgresMemory = postgresInstanceTypes[postgres.instanceType]?.memory || 32;
        const totalPostgresVcpu = postgresVcpu * postgres.instanceCount;
        const totalPostgresMemory = postgresMemory * postgres.instanceCount;
        
        // Add read replicas to processing power calculation
        const readReplicaVcpu = totalPostgresVcpu * (postgres.readReplicas / postgres.instanceCount);
        const effectivePostgresVcpu = totalPostgresVcpu + readReplicaVcpu;
        
        // In TiDB, SQL processing is done by TiDB nodes - calculate equivalent TiDB nodes
        // TiDB nodes are most closely comparable to PostgreSQL primary instances in function
        // Minimum of 3 TiDB nodes for HA, and each TiDB node has approximately 16 vCPU in a typical deployment (c5.4xlarge)
        const vcpuPerTidbNode = ec2InstanceTypes[instances.tidbInstanceType]?.vCPU || 16; // Get actual vCPU from selected instance
        const suggestedTidbNodesFromCpu = Math.max(3, Math.ceil(effectivePostgresVcpu / vcpuPerTidbNode));
        
        // Also calculate based on connections (balancing factor)
        const suggestedTidbNodesFromConn = Math.max(3, Math.ceil(workload.concurrentConnections / 500));
        
        // Take the larger of the two suggestions
        const baseTidbNodes = Math.max(suggestedTidbNodesFromCpu, suggestedTidbNodesFromConn);
        
        // Estimate TiKV nodes based on size and workload
        // Formula based on TiDB Cloud docs: ceil(data_size * compression_ratio * replicas / storage_usage_ratio / node_capacity / 3) * 3
        const compressionRatio = 0.4; // Typical compression ratio of 40%
        const storageUsageRatio = 0.8; // Recommended to keep usage below 80%
        const defaultNodeCapacity = 4000; // 4TB in GB - recommended max for PCIe SSD
        const suggestedTikvNodesForStorage = Math.ceil(
          (postgres.storageGB * compressionRatio * tidbCluster.dataReplicationFactor) / 
          (storageUsageRatio * defaultNodeCapacity * 3)
        ) * 3;
        
        // Calculate TiKV nodes based on write operations (TiKV is CPU sensitive for writes)
        // General rule: 1 TiKV node per X write operations
        const writesPerTikvNode = 5000; // Approximate writes per TiKV node
        const suggestedTikvNodesFromWrites = Math.max(3, Math.ceil(postgres.writeOps / writesPerTikvNode / 3) * 3);
        
        // Minimum of 3 TiKV nodes required
        const suggestedTikvNodes = Math.max(3, Math.max(suggestedTikvNodesForStorage, suggestedTikvNodesFromWrites));
        
        // More TiKV nodes for write-heavy workloads
        const writeHeavyFactor = workload.readWriteRatio.startsWith('50') ? 1.5 : 
                                workload.readWriteRatio.startsWith('30') ? 2 : 1;
        
        // TiFlash nodes for OLAP or Mixed workloads (analytics)
        const useTiflash = workload.type === 'OLAP' || workload.type === 'Mixed';
        
        // TiFlash replica calculation based on TiDB docs
        const tiflashReplicas = useTiflash ? 2 : 0; // Recommended minimum 2 replicas
        const suggestedTiflashNodes = useTiflash ? 
          Math.max(2, Math.ceil((postgres.storageGB * compressionRatio * tiflashReplicas) / 
          (tidbCluster.dataReplicationFactor * storageUsageRatio * defaultNodeCapacity))) : 0;
        
        // Adjust for traffic spikes
        const spikeFactor = workload.trafficSpikes ? Math.min(2, workload.peakRatio / 2) : 1;
        
        // Calculate number of worker nodes required
        // Each worker node can typically host 1-2 TiDB components
        const componentsPerWorker = 1.5; // Average components per worker node
        const totalComponents = 
          Math.ceil(baseTidbNodes * spikeFactor) + 
          Math.ceil(suggestedTikvNodes * writeHeavyFactor) + 
          tidbCluster.pdNodes + 
          suggestedTiflashNodes + 
          1; // +1 for monitoring
        const suggestedWorkerNodes = Math.max(6, Math.ceil(totalComponents / componentsPerWorker));
        
        // Update TiDB cluster configuration based on calculations
        setTidbCluster(prev => ({
          ...prev,
          tidbNodes: Math.ceil(baseTidbNodes * spikeFactor),
          tikvNodes: Math.ceil(suggestedTikvNodes * writeHeavyFactor),
          useTiflash: useTiflash,
          tiflashNodes: suggestedTiflashNodes,
          k8sWorkerNodes: suggestedWorkerNodes
        }));
        
        // Update instance types based on PostgreSQL configuration
        // If PostgreSQL is using high-memory instances, suggest similar for TiDB
        if (postgresMemory >= 128) {
          setInstances(prev => ({
            ...prev,
            tidbInstanceType: "r5.4xlarge" // High memory option
          }));
        } else if (postgresMemory >= 64) {
          setInstances(prev => ({
            ...prev,
            tidbInstanceType: "r5.2xlarge" // Medium-high memory option
          }));
        } else {
          setInstances(prev => ({
            ...prev,
            tidbInstanceType: "c5.4xlarge" // Default compute-optimized option
          }));
        }
        
        // If instance type has changed, record this in the comparison history
        if (postgres.instanceType !== comparisonData.previousInstanceType) {
          const prevType = comparisonData.previousInstanceType;
          const prevVcpu = postgresInstanceTypes[prevType]?.vCPU || 0;
          const prevMem = postgresInstanceTypes[prevType]?.memory || 0;
          const newVcpu = postgresInstanceTypes[postgres.instanceType]?.vCPU || 0;
          const newMem = postgresInstanceTypes[postgres.instanceType]?.memory || 0;
          
          // Add to history
          setComparisonData(prev => {
            // Calculate the total monthly cost of the TiDB deployment
            const tidbInstanceCost = ec2InstanceTypes[instances.tidbInstanceType]?.monthlyCost || 493;
            const tikvInstanceCost = ec2InstanceTypes[instances.tikvInstanceType]?.monthlyCost || 998;
            const pdInstanceCost = ec2InstanceTypes[instances.pdInstanceType]?.monthlyCost || 278;
            const tiflashInstanceCost = ec2InstanceTypes[instances.tiflashInstanceType]?.monthlyCost || 1995;
            const monitoringInstanceCost = ec2InstanceTypes[instances.monitoringInstanceType]?.monthlyCost || 246;

            const totalInstanceCost = 
              tidbInstanceCost * Math.ceil(baseTidbNodes * spikeFactor) +
              tikvInstanceCost * Math.ceil(suggestedTikvNodes * writeHeavyFactor) +
              pdInstanceCost * tidbCluster.pdNodes +
              tiflashInstanceCost * suggestedTiflashNodes +
              monitoringInstanceCost;
            
            const newHistory = [...prev.history];
            // Limit history to 10 items
            if (newHistory.length >= 10) {
              newHistory.shift();
            }
            
            newHistory.push({
              id: newHistory.length,
              from: prevType,
              to: postgres.instanceType,
              vcpuChange: `${prevVcpu} → ${newVcpu}`,
              memoryChange: `${prevMem}GB → ${newMem}GB`,
              tidbNodesChange: `${prev.history.length > 0 ? prev.history[prev.history.length-1].tidbNodes : 3} → ${Math.ceil(baseTidbNodes * spikeFactor)}`,
              tikvNodesChange: `${prev.history.length > 0 ? prev.history[prev.history.length-1].tikvNodes : 3} → ${Math.ceil(suggestedTikvNodes * writeHeavyFactor)}`,
              instanceTypeChange: `${prev.history.length > 0 ? prev.history[prev.history.length-1].tidbInstanceType : 'c5.4xlarge'} → ${postgresMemory >= 128 ? "r5.4xlarge" : postgresMemory >= 64 ? "r5.2xlarge" : "c5.4xlarge"}`,
              tidbNodes: Math.ceil(baseTidbNodes * spikeFactor),
              tikvNodes: Math.ceil(suggestedTikvNodes * writeHeavyFactor),
              tidbInstanceType: postgresMemory >= 128 ? "r5.4xlarge" : postgresMemory >= 64 ? "r5.2xlarge" : "c5.4xlarge",
              monthlyCost: totalInstanceCost
            });
            
            return {
              ...prev,
              previousInstanceType: postgres.instanceType,
              history: newHistory
            };
          });
        }
      }, [
        postgres.instanceType,
        postgres.instanceCount,
        postgres.readReplicas,
        postgres.writeOps,
        postgres.storageGB,
        workload.concurrentConnections, 
        workload.readWriteRatio, 
        workload.type,
        workload.trafficSpikes,
        workload.peakRatio,
        tidbCluster.dataReplicationFactor,
        tidbCluster.pdNodes,
        instances.tidbInstanceType,
        comparisonData.previousInstanceType
      ]);

      // Calculate cost metrics
      // Calculate EBS storage costs
      const calculateEbsCost = (type, sizeGB, iops = 3000, throughput = 125) => {
        if (sizeGB === 0) return 0;
        
        const ebsType = ebsVolumeTypes[type] || ebsVolumeTypes.gp3;
        let cost = sizeGB * ebsType.basePrice;
        
        if (type === "gp3" && iops > 3000) {
          cost += (iops - 3000) * ebsType.iopsPrice;
        }
        
        if (type === "gp3" && throughput > 125) {
          cost += (throughput - 125) * ebsType.throughputPrice;
        }
        
        if ((type === "io1" || type === "io2") && iops) {
          cost += iops * ebsType.iopsPrice;
        }
        
        return cost;
      };

      // Extract instance costs
      const tidbInstanceCost = ec2InstanceTypes[instances.tidbInstanceType]?.monthlyCost || 493;
      const tikvInstanceCost = ec2InstanceTypes[instances.tikvInstanceType]?.monthlyCost || 998;
      const pdInstanceCost = ec2InstanceTypes[instances.pdInstanceType]?.monthlyCost || 278;
      const tiflashInstanceCost = ec2InstanceTypes[instances.tiflashInstanceType]?.monthlyCost || 1995;
      const monitoringInstanceCost = ec2InstanceTypes[instances.monitoringInstanceType]?.monthlyCost || 246;

      // Calculate total EC2 instance costs
      const totalInstanceCost = 
        tidbInstanceCost * tidbCluster.tidbNodes +
        tikvInstanceCost * tidbCluster.tikvNodes +
        pdInstanceCost * tidbCluster.pdNodes +
        tiflashInstanceCost * tidbCluster.tiflashNodes +
        monitoringInstanceCost;

      // Calculate storage costs
      const tidbStorageCost = calculateEbsCost(storage.tidbEbsType, storage.tidbEbsSize) * tidbCluster.tidbNodes;
      
      const tikvUsingInstanceStore = storage.tikvUseInstanceStore && ec2InstanceTypes[instances.tikvInstanceType]?.nvme;
      const tikvInstanceStorageSize = tikvUsingInstanceStore ? (ec2InstanceTypes[instances.tikvInstanceType]?.nvme || 0) : 0;
      const tikvAdditionalStorageCost = calculateEbsCost(storage.tikvAdditionalEbsType, storage.tikvAdditionalEbsSize) * tidbCluster.tikvNodes;
      
      const pdStorageCost = calculateEbsCost(storage.pdEbsType, storage.pdEbsSize) * tidbCluster.pdNodes;
      const tiflashStorageCost = calculateEbsCost(storage.tiflashEbsType, storage.tiflashEbsSize) * tidbCluster.tiflashNodes;
      
      const totalStorageCost = tidbStorageCost + tikvAdditionalStorageCost + pdStorageCost + tiflashStorageCost;

      // S3 backup costs
      const s3BackupCost = operational.backupToS3 ? operational.backupSizeGB * 0.023 : 0; // $0.023 per GB per month

      // Network costs
      const networkCost = operational.networkTrafficGB * 0.01; // $0.01 per GB (simplified)

      // Calculate Kubernetes management costs
      const eksClusterCost = tidbCluster.eksClusterCount * operational.eksClusterCost;
      const eksMonitoringCost = operational.eksMonitoringCost;
      const totalKubernetesCost = eksClusterCost + eksMonitoringCost;

      // Calculate total recurring monthly costs
      const totalMonthlyCost = totalInstanceCost + totalStorageCost + s3BackupCost + networkCost + totalKubernetesCost;

      // Calculate one-time costs
      const oneTimeCosts = operational.migrationCost;

      // Calculate savings vs PostgreSQL
      const postgresMonthlyCost = postgres.monthlyCost;
      const monthlySavings = postgresMonthlyCost - totalMonthlyCost;
      const savingsPercentage = postgresMonthlyCost > 0 ? (monthlySavings / postgresMonthlyCost) * 100 : 0;
      const paybackPeriodMonths = monthlySavings > 0 ? oneTimeCosts / monthlySavings : Infinity;

      // Update cost breakdown data for chart
      useEffect(() => {
        const costBreakdownData = [
          { name: 'TiDB Nodes', value: tidbInstanceCost * tidbCluster.tidbNodes },
          { name: 'TiKV Nodes', value: tikvInstanceCost * tidbCluster.tikvNodes },
          { name: 'PD Nodes', value: pdInstanceCost * tidbCluster.pdNodes },
          { name: 'TiFlash Nodes', value: tiflashInstanceCost * tidbCluster.tiflashNodes },
          { name: 'Monitoring', value: monitoringInstanceCost },
          { name: 'Storage', value: totalStorageCost },
          { name: 'S3 Backup', value: s3BackupCost },
          { name: 'Network', value: networkCost },
          { name: 'Kubernetes', value: totalKubernetesCost }
        ];
        
        setComparisonData(prev => ({
          ...prev,
          costBreakdown: costBreakdownData
        }));
      }, [
        tidbInstanceCost,
        tikvInstanceCost,
        pdInstanceCost,
        tiflashInstanceCost,
        monitoringInstanceCost,
        totalStorageCost,
        s3BackupCost,
        networkCost,
        totalKubernetesCost,
        tidbCluster.tidbNodes,
        tidbCluster.tikvNodes,
        tidbCluster.pdNodes,
        tidbCluster.tiflashNodes
      ]);
      
      // Generate instance type impact data for visualization
      const instanceTypeImpactData = Object.keys(postgresInstanceTypes).map(type => {
        const pgVcpu = postgresInstanceTypes[type].vCPU;
        const pgMemory = postgresInstanceTypes[type].memory;
        const vcpuPerTidbNode = 16; // Default TiDB node vCPU
        
        // Estimate TiDB nodes based on vCPU
        const estimatedTidbNodes = Math.max(3, Math.ceil((pgVcpu * postgres.instanceCount) / vcpuPerTidbNode));
        
        // Determine instance type based on memory
        let recommendedInstanceType;
        if (pgMemory >= 128) {
          recommendedInstanceType = "r5.4xlarge";
        } else if (pgMemory >= 64) {
          recommendedInstanceType = "r5.2xlarge";
        } else {
          recommendedInstanceType = "c5.4xlarge";
        }
        
        const tidbCost = ec2InstanceTypes[recommendedInstanceType].monthlyCost * estimatedTidbNodes;
        
        return {
          name: type,
          vCPU: pgVcpu,
          memory: pgMemory,
          tidbNodes: estimatedTidbNodes,
          instanceType: recommendedInstanceType,
          tidbCost: tidbCost
        };
      });

      // Custom formatter for tooltip values
      const formatCurrency = (value) => {
        return `$${value.toFixed(2)}`;
      };

      // Get PostgreSQL instance configurations for comparison
      const pgConfigs = [
        {
          name: 'Small',
          instanceType: 'db.m5.large',
          cpu: postgresInstanceTypes['db.m5.large'].vCPU,
          memory: postgresInstanceTypes['db.m5.large'].memory,
          monthlyCost: postgresInstanceTypes['db.m5.large'].monthlyCost * 2 // Assuming 2 instances
        },
        {
          name: 'Medium',
          instanceType: 'db.r5.xlarge',
          cpu: postgresInstanceTypes['db.r5.xlarge'].vCPU,
          memory: postgresInstanceTypes['db.r5.xlarge'].memory,
          monthlyCost: postgresInstanceTypes['db.r5.xlarge'].monthlyCost * 2
        },
        {
          name: 'Large',
          instanceType: 'db.r5.2xlarge',
          cpu: postgresInstanceTypes['db.r5.2xlarge'].vCPU,
          memory: postgresInstanceTypes['db.r5.2xlarge'].memory,
          monthlyCost: postgresInstanceTypes['db.r5.2xlarge'].monthlyCost * 2
        },
        {
          name: 'X-Large',
          instanceType: 'db.r5.4xlarge',
          cpu: postgresInstanceTypes['db.r5.4xlarge'].vCPU,
          memory: postgresInstanceTypes['db.r5.4xlarge'].memory,
          monthlyCost: postgresInstanceTypes['db.r5.4xlarge'].monthlyCost * 2
        }
      ];

      // Calculate TiDB equivalent configs and costs for comparison
      const getTidbEquivalentConfig = (pgConfig) => {
        const pgVcpu = postgresInstanceTypes[pgConfig.instanceType].vCPU;
        const pgMemory = postgresInstanceTypes[pgConfig.instanceType].memory;
        const vcpuPerTidbNode = 16; // Default TiDB node vCPU
        
        // Estimate TiDB nodes based on vCPU
        const estimatedTidbNodes = Math.max(3, Math.ceil((pgVcpu * 2) / vcpuPerTidbNode));
        
        // Determine instance type based on memory
        let recommendedInstanceType;
        if (pgMemory >= 128) {
          recommendedInstanceType = "r5.4xlarge";
        } else if (pgMemory >= 64) {
          recommendedInstanceType = "r5.2xlarge";
        } else {
          recommendedInstanceType = "c5.4xlarge";
        }
        
        const tidbCost = ec2InstanceTypes[recommendedInstanceType].monthlyCost * estimatedTidbNodes;
        const tikvCost = ec2InstanceTypes["i3.4xlarge"].monthlyCost * 3; // Minimum 3 TiKV nodes
        const pdCost = ec2InstanceTypes["m5.2xlarge"].monthlyCost * 3; // Minimum 3 PD nodes
        
        return {
          tidbNodes: estimatedTidbNodes,
          instanceType: recommendedInstanceType,
          monthlyCost: tidbCost + tikvCost + pdCost + monitoringInstanceCost,
          savings: pgConfig.monthlyCost - (tidbCost + tikvCost + pdCost + monitoringInstanceCost),
          savingsPercentage: ((pgConfig.monthlyCost - (tidbCost + tikvCost + pdCost + monitoringInstanceCost)) / pgConfig.monthlyCost) * 100
        };
      };

      const comparisonConfigs = pgConfigs.map(pgConfig => ({
        ...pgConfig,
        tidb: getTidbEquivalentConfig(pgConfig)
      }));

      // Simplified Calculator view for first version
      return (
        <div className="mx-auto p-4 max-w-6xl">
          <h1 className="text-2xl font-bold mb-6 text-center">Enhanced TiDB Migration from PostgreSQL Cost Calculator</h1>
          
          {/* Tabs Navigation */}
          <div className="mb-6 flex border-b">
            <button 
              className={`py-2 px-4 font-medium ${activeTab === 'calculator' ? 'text-blue-600 border-blue-600 border-b-2' : 'text-gray-500'}`}
              onClick={() => setActiveTab('calculator')}>
              Calculator
            </button>
            <button 
              className={`py-2 px-4 font-medium ${activeTab === 'visualizations' ? 'text-blue-600 border-blue-600 border-b-2' : 'text-gray-500'}`}
              onClick={() => setActiveTab('visualizations')}>
              Impact Analysis
            </button>
            <button 
              className={`py-2 px-4 font-medium ${activeTab === 'comparison' ? 'text-blue-600 border-blue-600 border-b-2' : 'text-gray-500'}`}
              onClick={() => setActiveTab('comparison')}>
              Instance Comparison
            </button>
            <button 
              className={`py-2 px-4 font-medium ${activeTab === 'history' ? 'text-blue-600 border-blue-600 border-b-2' : 'text-gray-500'}`}
              onClick={() => setActiveTab('history')}>
              Change History
            </button>
          </div>
          
          {/* Main Calculator View */}
          {activeTab === 'calculator' && (
            <div className="bg-white p-6 rounded shadow">
              <h2 className="text-xl font-semibold mb-4">PostgreSQL to TiDB Migration Calculator</h2>
              
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">PostgreSQL Instance Type</label>
                <select
                  name="instanceType"
                  value={postgres.instanceType}
                  onChange={handlePostgresChange}
                  className="w-full p-2 border rounded"
                >
                  {Object.keys(postgresInstanceTypes).map(type => (
                    <option key={type} value={type}>
                      {type} ({postgresInstanceTypes[type].vCPU} vCPU, {postgresInstanceTypes[type].memory} GB)
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-2">Primary Instances</label>
                  <input
                    type="number"
                    name="instanceCount"
                    value={postgres.instanceCount}
                    onChange={handlePostgresChange}
                    className="w-full p-2 border rounded"
                    min="1"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Read Replicas</label>
                  <input
                    type="number"
                    name="readReplicas"
                    value={postgres.readReplicas}
                    onChange={handlePostgresChange}
                    className="w-full p-2 border rounded"
                    min="0"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Storage (GB)</label>
                  <input
                    type="number"
                    name="storageGB"
                    value={postgres.storageGB}
                    onChange={handlePostgresChange}
                    className="w-full p-2 border rounded"
                    min="0"
                  />
                </div>
                
                <div className="flex items-center pt-6">
                  <input
                    type="checkbox"
                    name="multiAZ"
                    checked={postgres.multiAZ}
                    onChange={handlePostgresChange}
                    className="mr-2"
                  />
                  <label>Multi-AZ Deployment</label>
                </div>
              </div>
              
              <div className="bg-blue-50 p-4 rounded mb-6">
                <h3 className="font-medium mb-3">TiDB Configuration</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div className="bg-white p-3 rounded shadow">
                    <div className="text-gray-600 text-sm">TiDB Nodes</div>
                    <div className="text-xl font-bold">{tidbCluster.tidbNodes}</div>
                    <div className="text-xs text-gray-500">{instances.tidbInstanceType}</div>
                  </div>
                  <div className="bg-white p-3 rounded shadow">
                    <div className="text-gray-600 text-sm">TiKV Nodes</div>
                    <div className="text-xl font-bold">{tidbCluster.tikvNodes}</div>
                    <div className="text-xs text-gray-500">{instances.tikvInstanceType}</div>
                  </div>
                  <div className="bg-white p-3 rounded shadow">
                    <div className="text-gray-600 text-sm">PD Nodes</div>
                    <div className="text-xl font-bold">{tidbCluster.pdNodes}</div>
                    <div className="text-xs text-gray-500">{instances.pdInstanceType}</div>
                  </div>
                  <div className="bg-white p-3 rounded shadow">
                    <div className="text-gray-600 text-sm">Total Storage (GB)</div>
                    <div className="text-xl font-bold">
                      {(tidbCluster.tidbNodes * storage.tidbEbsSize) + 
                       (tidbCluster.tikvNodes * (tikvInstanceStorageSize + storage.tikvAdditionalEbsSize)) + 
                       (tidbCluster.pdNodes * storage.pdEbsSize) + 
                       (tidbCluster.tiflashNodes * storage.tiflashEbsSize)}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="bg-green-50 p-4 rounded mb-6">
                <h3 className="font-medium mb-3">Cost Comparison</h3>
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="bg-white p-3 rounded shadow">
                    <div className="text-gray-600 text-sm">PostgreSQL Monthly</div>
                    <div className="text-2xl font-bold text-blue-700">${postgresMonthlyCost.toFixed(2)}</div>
                  </div>
                  <div className="bg-white p-3 rounded shadow">
                    <div className="text-gray-600 text-sm">TiDB Monthly</div>
                    <div className="text-2xl font-bold text-green-700">${totalMonthlyCost.toFixed(2)}</div>
                  </div>
                  <div className="bg-white p-3 rounded shadow">
                    <div className="text-gray-600 text-sm">Monthly Savings</div>
                    <div className={`text-2xl font-bold ${monthlySavings >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      ${monthlySavings.toFixed(2)}
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded shadow">
                    <div className="text-gray-600 text-sm">Savings %</div>
                    <div className={`text-2xl font-bold ${savingsPercentage >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {savingsPercentage.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Cost Breakdown */}
              <div className="bg-yellow-50 p-4 rounded">
                <h3 className="font-medium mb-3">TiDB Monthly Cost Breakdown</h3>
                <div className="h-64 chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={comparisonData.costBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis tickFormatter={formatCurrency} />
                      <Tooltip formatter={formatCurrency} />
                      <Bar dataKey="value" fill="#4f46e5" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
          
          {/* Impact Analysis Tab */}
          {activeTab === 'visualizations' && (
            <div className="bg-white p-6 rounded shadow">
              <h2 className="text-xl font-semibold mb-4">PostgreSQL Instance Type Impact Analysis</h2>
              <p className="mb-4 text-sm">This visualization shows how different PostgreSQL instance types affect TiDB resources and costs.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Chart for Instance Type Impact on TiDB Nodes */}
                <div className="bg-indigo-50 p-4 rounded shadow">
                  <h3 className="text-lg font-medium mb-3">TiDB Nodes by PostgreSQL Instance</h3>
                  <div className="h-64 chart-container">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={instanceTypeImpactData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="tidbNodes" fill="#4f46e5" name="TiDB Nodes" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                
                {/* Chart for Instance Type Impact on TiDB Cost */}
                <div className="bg-indigo-50 p-4 rounded shadow">
                  <h3 className="text-lg font-medium mb-3">TiDB Compute Cost by PostgreSQL Type</h3>
                  <div className="h-64 chart-container">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={instanceTypeImpactData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis tickFormatter={formatCurrency} />
                        <Tooltip formatter={formatCurrency} />
                        <Bar dataKey="tidbCost" fill="#10b981" name="TiDB Cost" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
              
              <div className="overflow-hidden shadow rounded-lg mb-6">
                <table className="min-w-full bg-white">
                  <thead className="bg-indigo-100">
                    <tr>
                      <th className="py-2 px-3 text-left text-sm font-medium text-gray-600">PostgreSQL Instance</th>
                      <th className="py-2 px-3 text-right text-sm font-medium text-gray-600">vCPU</th>
                      <th className="py-2 px-3 text-right text-sm font-medium text-gray-600">Memory (GB)</th>
                      <th className="py-2 px-3 text-right text-sm font-medium text-gray-600">Recommended TiDB Instance</th>
                      <th className="py-2 px-3 text-right text-sm font-medium text-gray-600">TiDB Nodes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {instanceTypeImpactData.map((item, index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                        <td className="py-2 px-3 text-sm text-gray-700">{item.name}</td>
                        <td className="py-2 px-3 text-sm text-right text-gray-700">{item.vCPU}</td>
                        <td className="py-2 px-3 text-sm text-right text-gray-700">{item.memory}</td>
                        <td className="py-2 px-3 text-sm text-right text-green-700">{item.instanceType}</td>
                        <td className="py-2 px-3 text-sm text-right text-green-700">{item.tidbNodes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="bg-blue-100 p-4 rounded">
                <h3 className="font-medium mb-2">Key Insights</h3>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>Higher vCPU PostgreSQL instances lead to more TiDB nodes</li>
                  <li>Memory-optimized PostgreSQL instances trigger recommendations for memory-optimized TiDB instances</li>
                  <li>Instances with ≥64GB memory use r5.2xlarge for TiDB nodes</li>
                  <li>Instances with ≥128GB memory use r5.4xlarge for TiDB nodes</li>
                </ul>
              </div>
            </div>
          )}
          
          {/* Instance Comparison Tab */}
          {activeTab === 'comparison' && (
            <div className="bg-white p-6 rounded shadow">
              <h2 className="text-xl font-semibold mb-4">PostgreSQL vs. TiDB Configuration Comparison</h2>
              
              <div className="overflow-hidden shadow rounded-lg mb-6">
                <table className="min-w-full bg-white">
                  <thead className="bg-indigo-100">
                    <tr>
                      <th className="py-3 px-4 text-left text-sm font-medium text-gray-600">PostgreSQL Config</th>
                      <th className="py-3 px-4 text-right text-sm font-medium text-gray-600">vCPU</th>
                      <th className="py-3 px-4 text-right text-sm font-medium text-gray-600">Memory (GB)</th>
                      <th className="py-3 px-4 text-right text-sm font-medium text-gray-600">Monthly Cost</th>
                      <th className="py-3 px-4 text-right text-sm font-medium text-gray-600">TiDB Monthly Cost</th>
                      <th className="py-3 px-4 text-right text-sm font-medium text-gray-600">Savings %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {comparisonConfigs.map((config, index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                        <td className="py-3 px-4 text-sm text-gray-700">
                          <div className="font-medium">{config.name}</div>
                          <div className="text-xs text-gray-500">{config.instanceType} x2</div>
                        </td>
                        <td className="py-3 px-4 text-sm text-right text-gray-700">{config.cpu * 2}</td>
                        <td className="py-3 px-4 text-sm text-right text-gray-700">{config.memory * 2}</td>
                        <td className="py-3 px-4 text-sm text-right text-blue-700 font-medium">${config.monthlyCost.toFixed(2)}</td>
                        <td className="py-3 px-4 text-sm text-right text-green-700 font-medium">${config.tidb.monthlyCost.toFixed(2)}</td>
                        <td className="py-3 px-4 text-sm text-right font-medium"
                            style={{ color: config.tidb.savingsPercentage >= 0 ? '#047857' : '#b91c1c' }}>
                          {config.tidb.savingsPercentage.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {comparisonConfigs.map((config, index) => (
                  <div key={index} className="p-4 border rounded shadow-sm">
                    <div className="text-lg font-medium mb-2">{config.name}</div>
                    <div className="text-sm mb-4">PostgreSQL: {config.instanceType} x2</div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">TiDB Nodes:</span>
                        <span className="text-sm font-medium">{config.tidb.tidbNodes}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Instance Type:</span>
                        <span className="text-sm font-medium">{config.tidb.instanceType}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Monthly Cost:</span>
                        <span className="text-sm font-medium">${config.tidb.monthlyCost.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Savings:</span>
                        <span className="text-sm font-medium" style={{ color: config.tidb.savings >= 0 ? '#047857' : '#b91c1c' }}>
                          ${config.tidb.savings.toFixed(2)} ({config.tidb.savingsPercentage.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Change History Tab */}
          {activeTab === 'history' && (
            <div className="bg-white p-6 rounded shadow">
              <h2 className="text-xl font-semibold mb-4">Configuration Change History</h2>
              
              {comparisonData.history.length === 0 ? (
                <div className="bg-gray-50 p-6 rounded shadow text-center">
                  <p>No changes recorded yet. Try changing the PostgreSQL instance type to see the impact.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {comparisonData.history.map((change, index) => (
                    <div key={index} className="bg-indigo-50 p-4 rounded shadow">
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-lg font-medium">Change #{change.id + 1}</h3>
                        <span className="text-sm text-gray-500">PostgreSQL Instance Type Change</span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                        <div>
                          <div className="text-sm text-gray-600">From Instance</div>
                          <div className="font-medium">{change.from}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-600">To Instance</div>
                          <div className="font-medium">{change.to}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-600">vCPU Change</div>
                          <div className="font-medium">{change.vcpuChange}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-600">Memory Change</div>
                          <div className="font-medium">{change.memoryChange}</div>
                        </div>
                      </div>
                      <div className="bg-white p-3 rounded">
                        <div className="text-sm font-medium mb-2">Impact on TiDB Configuration:</div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <div className="text-sm text-gray-600">TiDB Nodes</div>
                            <div className="font-medium">{change.tidbNodesChange}</div>
                          </div>
                          <div>
                            <div className="text-sm text-gray-600">TiKV Nodes</div>
                            <div className="font-medium">{change.tikvNodesChange}</div>
                          </div>
                          <div>
                            <div className="text-sm text-gray-600">Instance Type</div>
                            <div className="font-medium">{change.instanceTypeChange}</div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 text-right">
                        <div className="text-sm text-gray-600">Monthly Cost Impact</div>
                        <div className="text-lg font-medium">${change.monthlyCost.toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      );
    };

    // Render the application
    const root = createRoot(document.getElementById('root'));
    root.render(React.createElement(TiDBMigrationCalculator));
  </script>
</body>
</html>
