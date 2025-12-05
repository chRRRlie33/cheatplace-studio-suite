import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Package, Megaphone, Download, TrendingUp, UserPlus, Calendar } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, LineChart, Line, CartesianGrid } from "recharts";
import { format, subDays, startOfDay, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

type LogMetadata = {
  username?: string;
  email?: string;
  offer_title?: string;
  [key: string]: unknown;
};

export const StatsOverview = () => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [usersResult, offersResult, announcementsResult, downloadsResult] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("offers").select("id", { count: "exact", head: true }),
        supabase.from("announcements").select("id", { count: "exact", head: true }),
        supabase.from("offers").select("download_count"),
      ]);

      const totalDownloads = downloadsResult.data?.reduce((sum, offer) => sum + (offer.download_count || 0), 0) || 0;

      return {
        usersCount: usersResult.count || 0,
        offersCount: offersResult.count || 0,
        announcementsCount: announcementsResult.count || 0,
        totalDownloads,
      };
    },
  });

  // Fetch logs for charts (last 7 days)
  const { data: chartData } = useQuery({
    queryKey: ["dashboard-charts"],
    queryFn: async () => {
      const sevenDaysAgo = subDays(new Date(), 7).toISOString();
      
      const { data: logs } = await supabase
        .from("logs")
        .select("action_type, created_at, metadata")
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: true });

      // Group by day
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = subDays(new Date(), 6 - i);
        return {
          date: format(date, "dd/MM", { locale: fr }),
          fullDate: startOfDay(date).toISOString(),
          downloads: 0,
          signups: 0,
        };
      });

      logs?.forEach((log) => {
        const logDate = startOfDay(parseISO(log.created_at)).toISOString();
        const dayData = last7Days.find((d) => d.fullDate === logDate);
        if (dayData) {
          if (log.action_type === "download") {
            dayData.downloads++;
          } else if (log.action_type === "signup") {
            dayData.signups++;
          }
        }
      });

      return last7Days;
    },
  });

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Chargement des stats...</div>;
  }

  const statsCards = [
    {
      title: "Utilisateurs totaux",
      value: stats?.usersCount || 0,
      icon: Users,
      gradient: "from-primary to-accent",
    },
    {
      title: "Offres actives",
      value: stats?.offersCount || 0,
      icon: Package,
      gradient: "from-accent to-secondary",
    },
    {
      title: "Annonces publiées",
      value: stats?.announcementsCount || 0,
      icon: Megaphone,
      gradient: "from-secondary to-primary",
    },
    {
      title: "Téléchargements totaux",
      value: stats?.totalDownloads || 0,
      icon: Download,
      gradient: "from-primary to-secondary",
    },
  ];

  const chartConfig = {
    downloads: {
      label: "Téléchargements",
      color: "hsl(var(--primary))",
    },
    signups: {
      label: "Inscriptions",
      color: "hsl(var(--accent))",
    },
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statsCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card 
              key={stat.title} 
              className="card-glow hover:scale-105 transition-all"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <Icon className="h-5 w-5 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold bg-gradient-to-r bg-clip-text text-transparent" 
                     style={{ 
                       backgroundImage: `linear-gradient(to right, hsl(var(--primary)), hsl(var(--accent)))` 
                     }}>
                  {stat.value.toLocaleString()}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Downloads Chart */}
        <Card className="card-glow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              Téléchargements (7 derniers jours)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[250px] w-full">
              <BarChart data={chartData || []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar 
                  dataKey="downloads" 
                  fill="hsl(var(--primary))" 
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Signups Chart */}
        <Card className="card-glow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-accent" />
              Inscriptions (7 derniers jours)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[250px] w-full">
              <LineChart data={chartData || []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line 
                  type="monotone" 
                  dataKey="signups" 
                  stroke="hsl(var(--accent))" 
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--accent))", strokeWidth: 2 }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="card-glow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Aperçu rapide
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Moyenne de téléchargements par offre</span>
            <span className="text-xl font-bold text-primary">
              {stats?.offersCount && stats.offersCount > 0 
                ? Math.round((stats.totalDownloads || 0) / stats.offersCount) 
                : 0}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Taux d'engagement</span>
            <span className="text-xl font-bold text-accent">
              {stats?.usersCount && stats.usersCount > 0
                ? `${Math.round(((stats.totalDownloads || 0) / stats.usersCount) * 100)}%`
                : "0%"}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
