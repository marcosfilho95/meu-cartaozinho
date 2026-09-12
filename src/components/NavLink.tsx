import { NavLink as RouterNavLink, NavLinkProps } from "react-router-dom";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { prefetchRoute } from "@/lib/routeLoaders";

interface NavLinkCompatProps extends Omit<NavLinkProps, "className"> {
  className?: string;
  activeClassName?: string;
  pendingClassName?: string;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  ({ className, activeClassName, pendingClassName, to, onMouseEnter, onFocus, onTouchStart, ...props }, ref) => {
    // Baixa a página assim que o usuário passa o mouse/foco: o clique fica instantâneo.
    const warm = () => {
      if (typeof to === "string") prefetchRoute(to);
    };
    return (
      <RouterNavLink
        ref={ref}
        to={to}
        onMouseEnter={(event) => { warm(); onMouseEnter?.(event); }}
        onFocus={(event) => { warm(); onFocus?.(event); }}
        onTouchStart={(event) => { warm(); onTouchStart?.(event); }}
        className={({ isActive, isPending }) =>
          cn(className, isActive && activeClassName, isPending && pendingClassName)
        }
        {...props}
      />
    );
  },
);

NavLink.displayName = "NavLink";

export { NavLink };
