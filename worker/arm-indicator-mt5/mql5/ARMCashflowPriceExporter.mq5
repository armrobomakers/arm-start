#property strict
#property script_show_inputs

#define PRICE_REQUESTS "ARMIndicator/cashflow-price-requests.csv"
#define PRICE_TMP "ARMIndicator/cashflow-historical-prices.csv.tmp"
#define PRICE_OUT "ARMIndicator/cashflow-historical-prices.csv"
#define CONVERSION_REQUESTS "ARMIndicator/cashflow-conversion-price-requests.csv"
#define CONVERSION_TMP "ARMIndicator/cashflow-conversion-historical-prices.csv.tmp"
#define CONVERSION_OUT "ARMIndicator/cashflow-conversion-historical-prices.csv"

int Lookbacks[7] = {15*60, 2*60*60, 12*60*60, 36*60*60, 72*60*60, 120*60*60, 168*60*60};
int PriceRequests=0,PriceTicks=0,PricePrevious=0,PriceM1=0,PriceMissing=0;
int ConversionRequests=0,ConversionTicks=0,ConversionPrevious=0,ConversionM1=0,ConversionMissing=0;
long MaxTickGap=0;

bool Secure()
  {
   if(TerminalInfoInteger(TERMINAL_CONNECTED)!=1 || AccountInfoInteger(ACCOUNT_TRADE_ALLOWED)!=0 || AccountInfoString(ACCOUNT_SERVER)!="Tickmill-Live")
     { Print("CRITICAL: cashflow exporter security check failed"); return false; }
   return true;
  }

bool FindTick(const string symbol,const ulong requested_msc,MqlTick &selected)
  {
   bool found=false;
   ZeroMemory(selected);
   for(int window=0;window<7 && !found;window++)
     {
      MqlTick ticks[];
      ulong span=(ulong)Lookbacks[window]*1000;
      ulong from=requested_msc>span ? requested_msc-span : 0;
      int count=CopyTicksRange(symbol,ticks,COPY_TICKS_ALL,from,requested_msc);
      for(int i=0;i<count;i++)
        if((ulong)ticks[i].time_msc<=requested_msc && (ticks[i].bid>0 || ticks[i].ask>0) && (!found || ticks[i].time_msc>selected.time_msc))
          { selected=ticks[i]; found=true; }
     }
   return found;
  }

bool FindM1(const string symbol,const datetime requested_time,datetime &actual,double &price)
  {
   MqlRates rates[];
   datetime from=requested_time>7*24*60*60 ? requested_time-7*24*60*60 : 0;
   int count=CopyRates(symbol,PERIOD_M1,from,requested_time+60,rates);
   int selected=-1;
   for(int i=0;i<count;i++) if(rates[i].time<=requested_time) selected=i;
   if(selected<0) return false;
   actual=rates[selected].time;
   price=rates[selected].close;
   return true;
  }

long GapSeconds(const datetime requested,const long actual_msc)
  { return (long)requested-actual_msc/1000; }

bool ProcessPriceFile()
  {
   int input_file=FileOpen(PRICE_REQUESTS,FILE_READ|FILE_CSV|FILE_ANSI|FILE_COMMON,';');
   if(input_file==INVALID_HANDLE) { PrintFormat("CRITICAL: cashflow price requests open failed, error=%d",GetLastError()); return false; }
   FileDelete(PRICE_TMP,FILE_COMMON);
   int output=FileOpen(PRICE_TMP,FILE_WRITE|FILE_CSV|FILE_ANSI|FILE_COMMON,';');
   if(output==INVALID_HANDLE) { FileClose(input_file); return false; }
   for(int i=0;i<7;i++) FileReadString(input_file);
   FileWrite(output,"flow_id","position_id","source_symbol","requested_server_time","actual_tick_time","bid","ask","gap_seconds","source","status","direction","volume","weighted_open_price");
   int requests=0,ticks_found=0,previous=0,m1=0,missing=0;
   while(!FileIsEnding(input_file))
     {
      string flow=FileReadString(input_file),symbol=FileReadString(input_file),requested=FileReadString(input_file),position=FileReadString(input_file),direction=FileReadString(input_file),volume=FileReadString(input_file),open_price=FileReadString(input_file);
      if(flow=="" || symbol=="" || requested=="") continue;
      datetime requested_time=StringToTime(requested); ulong requested_msc=(ulong)requested_time*1000; MqlTick tick;
      if(FindTick(symbol,requested_msc,tick))
        { long gap=GapSeconds(requested_time,tick.time_msc); FileWrite(output,flow,position,symbol,requested,TimeToString((datetime)(tick.time_msc/1000),TIME_DATE|TIME_SECONDS),DoubleToString(tick.bid,8),DoubleToString(tick.ask,8),gap,"tick","ok",direction,volume,open_price); ticks_found++; if(gap>600) previous++; if(gap>MaxTickGap) MaxTickGap=gap; }
      else
        { datetime actual; double close; if(FindM1(symbol,requested_time,actual,close)) { long gap=(long)requested_time-(long)actual; FileWrite(output,flow,position,symbol,requested,TimeToString(actual,TIME_DATE|TIME_SECONDS),"","",gap,"m1_fallback","approximate",direction,volume,open_price); m1++; if(gap>MaxTickGap) MaxTickGap=gap; } else { FileWrite(output,flow,position,symbol,requested,"","","",0,"","missing",direction,volume,open_price); missing++; } }
      requests++; if(requests%100==0) PrintFormat("EXPORT CASHFLOW PRICES %d",requests);
     }
   FileFlush(output); FileClose(input_file); FileClose(output);
   if(!FileMove(PRICE_TMP,FILE_COMMON,PRICE_OUT,FILE_COMMON|FILE_REWRITE)) { FileDelete(PRICE_TMP,FILE_COMMON); return false; }
   PriceRequests=requests; PriceTicks=ticks_found; PricePrevious=previous; PriceM1=m1; PriceMissing=missing;
   return true;
  }

bool ProcessConversionFile()
  {
   int input_file=FileOpen(CONVERSION_REQUESTS,FILE_READ|FILE_CSV|FILE_ANSI|FILE_COMMON,';');
   if(input_file==INVALID_HANDLE) { PrintFormat("CRITICAL: cashflow conversion requests open failed, error=%d",GetLastError()); return false; }
   FileDelete(CONVERSION_TMP,FILE_COMMON);
   int output=FileOpen(CONVERSION_TMP,FILE_WRITE|FILE_CSV|FILE_ANSI|FILE_COMMON,';');
   if(output==INVALID_HANDLE) { FileClose(input_file); return false; }
   for(int i=0;i<7;i++) FileReadString(input_file);
   FileWrite(output,"flow_id","conversion_symbol","requested_server_time","actual_tick_time","bid","ask","gap_seconds","source","status","direction","source_symbol","profit_currency","account_currency");
   int requests=0,ticks_found=0,previous=0,m1=0,missing=0;
   while(!FileIsEnding(input_file))
     {
      string flow=FileReadString(input_file),symbol=FileReadString(input_file),requested=FileReadString(input_file),direction=FileReadString(input_file),source=FileReadString(input_file),profit=FileReadString(input_file),account=FileReadString(input_file);
      if(flow=="" || symbol=="" || requested=="") continue;
      datetime requested_time=StringToTime(requested); ulong requested_msc=(ulong)requested_time*1000; MqlTick tick;
      if(FindTick(symbol,requested_msc,tick))
        { long gap=GapSeconds(requested_time,tick.time_msc); FileWrite(output,flow,symbol,requested,TimeToString((datetime)(tick.time_msc/1000),TIME_DATE|TIME_SECONDS),DoubleToString(tick.bid,8),DoubleToString(tick.ask,8),gap,"tick","ok",direction,source,profit,account); ticks_found++; if(gap>600) previous++; if(gap>MaxTickGap) MaxTickGap=gap; }
      else
        { datetime actual; double close; if(FindM1(symbol,requested_time,actual,close)) { long gap=(long)requested_time-(long)actual; FileWrite(output,flow,symbol,requested,TimeToString(actual,TIME_DATE|TIME_SECONDS),"","",gap,"m1_fallback","approximate",direction,source,profit,account); m1++; if(gap>MaxTickGap) MaxTickGap=gap; } else { FileWrite(output,flow,symbol,requested,"","","",0,"","missing",direction,source,profit,account); missing++; } }
      requests++; if(requests%100==0) PrintFormat("EXPORT CASHFLOW CONVERSIONS %d",requests);
     }
   FileFlush(output); FileClose(input_file); FileClose(output);
   if(!FileMove(CONVERSION_TMP,FILE_COMMON,CONVERSION_OUT,FILE_COMMON|FILE_REWRITE)) { FileDelete(CONVERSION_TMP,FILE_COMMON); return false; }
   ConversionRequests=requests; ConversionTicks=ticks_found; ConversionPrevious=previous; ConversionM1=m1; ConversionMissing=missing;
   return true;
  }

int OnStart()
  {
   if(!Secure()) return 1;
   if(!ProcessPriceFile()) return 2;
   if(!ProcessConversionFile()) return 3;
   PrintFormat("CASHFLOW PRICE EXPORT FINISHED price_requests=%d price_ticks=%d price_previous_session_ticks=%d price_m1_fallbacks=%d price_missing=%d conversion_requests=%d conversion_ticks=%d conversion_previous_session_ticks=%d conversion_m1_fallbacks=%d conversion_missing=%d max_tick_gap_seconds=%d",PriceRequests,PriceTicks,PricePrevious,PriceM1,PriceMissing,ConversionRequests,ConversionTicks,ConversionPrevious,ConversionM1,ConversionMissing,(int)MaxTickGap);
   return 0;
  }
